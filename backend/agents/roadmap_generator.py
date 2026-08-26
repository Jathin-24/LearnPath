"""
roadmap_generator.py

Roadmap Generator Agent: attaches a ProjectAssignment + TopicAssessment to
each Path-A dataset node (Path-B stub nodes stay unfilled - flagged for the
not-yet-built Path-B agent, per docs/api_contract.md step 4), then finalizes
the roadmap for review.

Per docs/project_brief.md section 7 ("explicit generate -> review -> confirm"
decision): this agent pauses the graph (next_agent=DONE) after assembling
the roadmap - state.stage moves to ROADMAP_REVIEW and the user reviews/edits
before /roadmap/confirm locks it in and unlocks the first available nodes.

One combined LLM call per dataset node (project + quiz together) to keep
free-tier call volume down - Project Generator's responsibility (per
docs/project_brief.md's agent table) is folded in here rather than a
separate graph node, since CLAUDE.md's build order doesn't list it as its
own step.

Also owns writing to the roadmap_templates cache (backend/common/db.py):
once a freshly-generated roadmap's nodes all have projects/assessments
attached, it's saved so the next learner with a very similar goal can
reuse it (backend/agents/path_a.py checks this cache first). Nodes reused
from a template already have `project` set, so the per-node generation
loop below skips them - the same loop naturally handles both "fresh
generation" and "template reuse, nothing left to do" without a separate
flag.
"""

import json

from pydantic import BaseModel, ValidationError

from backend.agents.knowledge_extractor import format_knowledge_digest
from backend.agents.path_b import run_path_b
from backend.common import db
from backend.common.llm_client import LLMClient
from backend.common.slugify import slugify
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    ConversationStage,
    MCQQuestion,
    PathType,
    ProjectAssignment,
    RoadmapNode,
    Subtopic,
    TopicAssessment,
)
from backend.rag.retriever import embed_text

QUESTIONS_PER_NODE = 3


class NodeContentOutput(BaseModel):
    project_title: str
    project_description: str
    success_criteria: list[str]
    questions: list[MCQQuestion]
    estimated_days: int


def _parse_json(raw_text: str) -> dict:
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


def _build_prompt(
    topic: str,
    course_summary: str | None,
    timeline: str | None,
    known_concepts: list[str],
    knowledge_digest: str = "",
) -> str:
    summary_clause = f": {course_summary}" if course_summary else ""
    timeline_clause = f" The learner's overall timeline is: {timeline}." if timeline else ""
    known_clause = (
        f" The learner has already demonstrated (via quiz) that they know: "
        f"{', '.join(known_concepts)} - keep the project and quiz appropriately challenging for "
        f"someone at that level rather than re-teaching it from scratch, where this topic overlaps."
        if known_concepts
        else ""
    )
    return f"""Generate a checkpoint project and a short assessment quiz for a learner \
studying "{topic}"{summary_clause}.{timeline_clause}{known_clause}{knowledge_digest}

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{
  "project_title": "short project title",
  "project_description": "2-3 sentences describing a hands-on project applying this topic",
  "success_criteria": ["2-4 short, concrete bullet points describing what a completed, working \
version of the project looks like"],
  "questions": [
    {{"question": "...", "options": ["...", "...", "...", "..."], "correct_option_index": 0, \
"explanation": "one sentence on why that answer is correct"}}
  ],
  "estimated_days": 5
}}
Write exactly {QUESTIONS_PER_NODE} questions, each with exactly 4 options and an explanation
(shown to the learner if they get it wrong). estimated_days is a realistic whole number of days
for THIS one topic alone (not the whole roadmap), consistent with the learner's overall timeline
if one was given."""


def _generate_node_content(
    client: LLMClient,
    topic: str,
    course_summary: str | None,
    timeline: str | None,
    known_concepts: list[str],
    knowledge_digest: str = "",
) -> NodeContentOutput:
    prompt = _build_prompt(topic, course_summary, timeline, known_concepts, knowledge_digest)

    def attempt(p: str) -> NodeContentOutput:
        output = NodeContentOutput.model_validate(_parse_json(client.complete(p, max_tokens=1500)))
        if len(output.questions) != QUESTIONS_PER_NODE:
            raise ValueError(f"expected {QUESTIONS_PER_NODE} questions, got {len(output.questions)}")
        return output

    try:
        return attempt(prompt)
    except (json.JSONDecodeError, ValidationError, ValueError):
        stricter = prompt + (
            f"\n\nYou MUST return exactly {QUESTIONS_PER_NODE} questions. Respond with ONLY valid JSON."
        )
        return attempt(stricter)  # let this raise if it fails again - fail loud


class SubtopicOutput(BaseModel):
    subtopics: list[str]


_SUBTOPIC_PROMPT_TEMPLATE = """List the specific sub-concepts a learner needs to cover to \
learn "{topic}"{summary_clause}{known_clause}

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{
  "subtopics": ["short sub-concept name", "another one"]
}}
Write 4-8 short sub-concept names (a few words each, not full sentences), ordered the way a \
learner would naturally tackle them."""


def _generate_subtopics(
    client: LLMClient,
    topic: str,
    course_summary: str | None,
    known_concepts: list[str],
) -> list[Subtopic]:
    summary_clause = f": {course_summary}" if course_summary else ""
    known_clause = (
        f" The learner already knows: {', '.join(known_concepts)} - skip those if they overlap."
        if known_concepts
        else ""
    )
    prompt = _SUBTOPIC_PROMPT_TEMPLATE.format(
        topic=topic, summary_clause=summary_clause, known_clause=known_clause
    )

    def attempt(p: str) -> SubtopicOutput:
        return SubtopicOutput.model_validate(_parse_json(client.complete(p, max_tokens=400)))

    try:
        output = attempt(prompt)
    except (json.JSONDecodeError, ValidationError):
        stricter = prompt + "\n\nRespond with ONLY valid JSON, no commentary."
        output = attempt(stricter)  # let this raise if it fails again - fail loud

    return [Subtopic(subtopic_id=slugify(name), name=name) for name in output.subtopics]


def ensure_subtopics(state: AppState, node: RoadmapNode, llm_client: LLMClient | None = None) -> None:
    """Lazily fills node.subtopics the first time this node is reached - see
    main.py's _unlock_next_in_sequence, which calls this right before a node
    goes LOCKED -> AVAILABLE. A no-op if subtopics are already populated
    (covers both "already generated" and "regenerate" callers that check
    first)."""
    if node.subtopics:
        return
    client = llm_client or LLMClient()
    known_concepts = state.skill_gap_map.known()
    node.subtopics = _generate_subtopics(client, node.topic, node.course_summary, known_concepts)


class ProjectExpansionOutput(BaseModel):
    detailed_description: str


_EXPAND_PROMPT_TEMPLATE = """A learner studying "{topic}" has this project:

Title: {title}
Short description: {description}

Write a longer, step-by-step version of this same project - concrete steps to actually build \
it, in order, plus 1-2 sentences on common pitfalls to watch for. Keep it to the same project, \
don't change scope.{knowledge_digest}

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{"detailed_description": "the longer, step-by-step version, plain text with line breaks between steps"}}"""


def expand_project_description(
    state: AppState, node: RoadmapNode, llm_client: LLMClient | None = None
) -> str:
    """Generates (and caches onto node.project.detailed_description) a
    longer, step-by-step version of the node's existing short project
    description - see main.py's /topic/{node_id}/project/expand. One extra
    LLM call, only made when the learner actually asks for it."""
    if node.project is None:
        raise ValueError(f"Node {node.node_id!r} has no project to expand")
    if node.project.detailed_description:
        return node.project.detailed_description

    client = llm_client or LLMClient()
    knowledge_digest = (
        format_knowledge_digest(db.get_knowledge_for_user(state.user_id)) if state.user_id else ""
    )
    prompt = _EXPAND_PROMPT_TEMPLATE.format(
        topic=node.topic,
        title=node.project.title,
        description=node.project.description,
        knowledge_digest=knowledge_digest,
    )

    def attempt(p: str) -> ProjectExpansionOutput:
        return ProjectExpansionOutput.model_validate(_parse_json(client.complete(p, max_tokens=900)))

    try:
        output = attempt(prompt)
    except (json.JSONDecodeError, ValidationError):
        stricter = prompt + "\n\nRespond with ONLY valid JSON, no commentary."
        output = attempt(stricter)  # let this raise if it fails again - fail loud

    node.project.detailed_description = output.detailed_description
    return output.detailed_description


def regenerate_node_content(state: AppState, node: RoadmapNode, llm_client: LLMClient | None = None) -> None:
    """Force-regenerates a single node's project+quiz (and subtopics, if it
    already had any) - used by main.py's /topic/{id}/regenerate and
    /roadmap/regenerate. Unlike the lazy-generation path (ensure_subtopics),
    this always overwrites, using the latest knowledge-base digest so a
    learner who's added more context gets a more personalized result.
    Callers are responsible for restricting this to non-COMPLETE nodes -
    this function doesn't check status, so a graded module isn't silently
    rewritten by an unguarded call."""
    client = llm_client or LLMClient()
    known_concepts = state.skill_gap_map.known()
    knowledge_digest = (
        format_knowledge_digest(db.get_knowledge_for_user(state.user_id)) if state.user_id else ""
    )

    if node.path_type == PathType.PATH_A_DATASET:
        content = _generate_node_content(
            client,
            node.topic,
            node.course_summary,
            state.learner_profile.timeline,
            known_concepts,
            knowledge_digest,
        )
        node.project = ProjectAssignment(
            title=content.project_title,
            description=content.project_description,
            success_criteria=content.success_criteria,
        )
        node.assessment = TopicAssessment(questions=content.questions)
        node.estimated_days = max(1, content.estimated_days)
    else:
        run_path_b(state, node_id=node.node_id, llm_client=client, force=True)

    if node.subtopics:
        node.subtopics = _generate_subtopics(client, node.topic, node.course_summary, known_concepts)


def _save_as_template(state: AppState) -> None:
    """Caching is an optimization, not correctness - never let a caching
    failure break an otherwise-complete roadmap for this user."""
    try:
        embedding = embed_text(state.learner_profile.goal)
        nodes_json = [n.model_dump(mode="json") for n in state.roadmap.nodes]
        db.save_roadmap_template(state.learner_profile.goal, embedding, nodes_json)
    except Exception as exc:
        state.log(AgentName.ROADMAP_GENERATOR, "template_cache_write_failed", detail=str(exc))


def run_roadmap_generator(state: AppState, llm_client: LLMClient | None = None) -> AppState:
    if state.roadmap is None:
        raise ValueError(
            "Roadmap Generator requires state.roadmap to already exist (Path-A must run first)"
        )

    client = llm_client or LLMClient()

    dataset_nodes = [n for n in state.roadmap.nodes if n.path_type == PathType.PATH_A_DATASET]
    web_nodes = [n for n in state.roadmap.nodes if n.path_type == PathType.PATH_B_OPEN_WEB]
    was_reused = bool(dataset_nodes) and all(n.project is not None for n in dataset_nodes)

    known_concepts = state.skill_gap_map.known()
    knowledge_digest = (
        format_knowledge_digest(db.get_knowledge_for_user(state.user_id)) if state.user_id else ""
    )
    for node in dataset_nodes:
        if node.project is not None:
            continue  # already populated - this roadmap was reused from a template
        content = _generate_node_content(
            client,
            node.topic,
            node.course_summary,
            state.learner_profile.timeline,
            known_concepts,
            knowledge_digest,
        )
        node.project = ProjectAssignment(
            title=content.project_title,
            description=content.project_description,
            success_criteria=content.success_criteria,
        )
        node.assessment = TopicAssessment(questions=content.questions)
        node.estimated_days = max(1, content.estimated_days)

    for node in web_nodes:
        if node.project is not None:
            continue  # already populated - reused from a template
        # Fills project/quiz/cheat_sheet_notes/web_sources/youtube_links via
        # web search + synthesis - see path_b.py's module docstring.
        run_path_b(state, node_id=node.node_id, llm_client=client)

    state.stage = ConversationStage.ROADMAP_REVIEW
    state.log(
        AgentName.ROADMAP_GENERATOR,
        "roadmap_finalized",
        detail=f"{len(state.roadmap.nodes)} nodes, projects/assessments attached to dataset nodes",
    )

    if not was_reused and state.learner_profile.goal:
        _save_as_template(state)

    state.next_agent = AgentName.DONE
    return state
