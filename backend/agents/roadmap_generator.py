"""
roadmap_generator.py

Roadmap Generator Agent: finalizes the roadmap's topic skeleton for review.
Path-B stub nodes get their RESOURCES (cheat sheet notes/web sources/
YouTube links) filled eagerly here via run_path_b - useful to browse even
before starting. Neither path type gets its project/final quiz attached
here any more - see generate_final_content below.

Per docs/project_brief.md section 7 ("explicit generate -> review -> confirm"
decision): this agent pauses the graph (next_agent=DONE) after assembling
the roadmap - state.stage moves to ROADMAP_REVIEW and the user reviews/edits
before /roadmap/confirm locks it in and unlocks the first available nodes.

A Path-A dataset node's ProjectAssignment + final TopicAssessment (one
combined LLM call, kept together to keep free-tier call volume down) is
generated lazily by generate_final_content, only once every one of that
node's subtopics has been resolved (passed or explicitly skipped - see
main.py's _maybe_generate_final_content, called from the subtopic quiz
submit/skip routes and from _unlock_next_in_sequence for the zero-subtopic
edge case). This mirrors the same "don't spend LLM calls on modules the
learner hasn't reached" reasoning that already made subtopics themselves
lazy (ensure_subtopics) - extended one step further so the topic's project
and checkpoint quiz aren't generated, or shown, until the learner has
actually worked through its sub-concepts.

Also owns writing to the roadmap_templates cache (backend/common/db.py):
a freshly-generated roadmap's topic list is saved so the next learner with
a very similar goal can reuse it (backend/agents/path_a.py checks this
cache first) - this only ever caches the skeleton now (topics/prereqs/
course links), never project/assessment content, since that's generated
per-learner anyway.
"""

import json

from pydantic import BaseModel, ValidationError

from backend.agents.knowledge_extractor import format_knowledge_digest
from backend.agents.path_b import generate_project_and_quiz_from_notes, run_path_b
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
    SubtopicStatus,
    TopicAssessment,
)
from backend.rag.retriever import embed_text

QUESTIONS_PER_NODE = 3
SUBTOPIC_QUIZ_QUESTIONS = 2


class NodeContentOutput(BaseModel):
    project_title: str
    project_description: str
    success_criteria: list[str]
    questions: list[MCQQuestion]
    estimated_days: int


def _parse_json(raw_text: str) -> dict:
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


def _normalize_multiline(text: str) -> str:
    """Some LLM responses double-escape newlines inside their JSON string
    (i.e. the JSON contains a literal backslash-n rather than a real
    newline), which json.loads then decodes as-is - the learner sees a
    literal "\\n" in a long-form field instead of a line break. Cheap,
    safe normalize rather than a stricter prompt that isn't reliably
    followed."""
    return text.replace("\\n", "\n").replace("\\r", "\r")


def _build_prompt(
    topic: str,
    course_summary: str | None,
    timeline: str | None,
    known_concepts: list[str],
    knowledge_digest: str = "",
    instructions: str = "",
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
    instructions_clause = (
        f" The learner also asked for this to be taken into account: {instructions}"
        if instructions
        else ""
    )
    return f"""Generate a checkpoint project and a short assessment quiz for a learner \
studying "{topic}"{summary_clause}.{timeline_clause}{known_clause}{instructions_clause}{knowledge_digest}

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
    instructions: str = "",
) -> NodeContentOutput:
    prompt = _build_prompt(topic, course_summary, timeline, known_concepts, knowledge_digest, instructions)

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


def _init_subtopic_progress(subtopics: list[Subtopic]) -> None:
    """First subtopic becomes AVAILABLE (its "Done Learning" quiz can be
    generated), the rest stay LOCKED - the strictly-sequential ordering the
    user asked for, mirroring how roadmap nodes themselves unlock one at a
    time (see main.py's _unlock_next_in_sequence)."""
    if subtopics:
        subtopics[0].status = SubtopicStatus.AVAILABLE


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
    _init_subtopic_progress(node.subtopics)


class SubtopicQuizOutput(BaseModel):
    questions: list[MCQQuestion]


_SUBTOPIC_QUIZ_PROMPT_TEMPLATE = """Write a short quiz for a learner who just studied the \
sub-concept "{subtopic}", part of learning "{topic}"{summary_clause}.

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{
  "questions": [
    {{"question": "...", "options": ["...", "...", "...", "..."], "correct_option_index": 0, \
"explanation": "one sentence on why that answer is correct"}}
  ]
}}
Write exactly {n} questions, each with exactly 4 options and an explanation, testing ONLY \
"{subtopic}" itself - not the broader topic."""


def generate_subtopic_quiz(
    state: AppState, node: RoadmapNode, subtopic: Subtopic, llm_client: LLMClient | None = None
) -> TopicAssessment:
    """Generates (and caches onto subtopic.quiz) a short quiz for one
    sub-concept - triggered by the learner's "Done Learning" action (see
    main.py's /topic/{id}/subtopic/{id}/quiz/generate). Idempotent: returns
    the existing quiz without spending another call if one was already
    generated (e.g. the learner navigated away and came back)."""
    if subtopic.quiz is not None:
        return subtopic.quiz

    client = llm_client or LLMClient()
    summary_clause = f": {node.course_summary}" if node.course_summary else ""
    prompt = _SUBTOPIC_QUIZ_PROMPT_TEMPLATE.format(
        subtopic=subtopic.name, topic=node.topic, summary_clause=summary_clause, n=SUBTOPIC_QUIZ_QUESTIONS
    )

    def attempt(p: str) -> SubtopicQuizOutput:
        output = SubtopicQuizOutput.model_validate(_parse_json(client.complete(p, max_tokens=900)))
        if len(output.questions) != SUBTOPIC_QUIZ_QUESTIONS:
            raise ValueError(f"expected {SUBTOPIC_QUIZ_QUESTIONS} questions, got {len(output.questions)}")
        return output

    try:
        output = attempt(prompt)
    except (json.JSONDecodeError, ValidationError, ValueError):
        stricter = prompt + (
            f"\n\nYou MUST return exactly {SUBTOPIC_QUIZ_QUESTIONS} questions. Respond with ONLY valid JSON."
        )
        output = attempt(stricter)  # let this raise if it fails again - fail loud

    subtopic.quiz = TopicAssessment(questions=output.questions)
    return subtopic.quiz


def generate_final_content(state: AppState, node: RoadmapNode, llm_client: LLMClient | None = None) -> None:
    """Generates the topic's project + final checkpoint quiz - deferred
    until every subtopic is PASSED/SKIPPED (see main.py's
    _maybe_generate_final_content), per the user's explicit "don't generate
    the quiz right now" request: no LLM spend on a topic's wrap-up content
    until the learner has actually worked through its sub-concepts.
    Idempotent - a no-op if node.project is already set, so callers can
    call this unconditionally after each subtopic resolves."""
    if node.project is not None:
        return

    client = llm_client or LLMClient()
    known_concepts = state.skill_gap_map.known()
    knowledge_digest = (
        format_knowledge_digest(db.get_knowledge_for_user(state.user_id)) if state.user_id else ""
    )
    instructions = state.learner_profile.roadmap_instructions or ""

    if node.path_type == PathType.PATH_A_DATASET:
        content = _generate_node_content(
            client,
            node.topic,
            node.course_summary,
            state.learner_profile.timeline,
            known_concepts,
            knowledge_digest,
            instructions,
        )
        node.project = ProjectAssignment(
            title=content.project_title,
            description=content.project_description,
            success_criteria=content.success_criteria,
        )
        node.assessment = TopicAssessment(questions=content.questions)
        node.estimated_days = max(1, content.estimated_days)
    else:
        # Resources (cheat_sheet_notes) already exist from the eager fill in
        # run_roadmap_generator below - generate project/quiz from those
        # directly rather than force-regenerating (which would re-search).
        generate_project_and_quiz_from_notes(state, node, client)


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

    node.project.detailed_description = _normalize_multiline(output.detailed_description)
    return node.project.detailed_description


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
    instructions = state.learner_profile.roadmap_instructions or ""

    if node.path_type == PathType.PATH_A_DATASET:
        content = _generate_node_content(
            client,
            node.topic,
            node.course_summary,
            state.learner_profile.timeline,
            known_concepts,
            knowledge_digest,
            instructions,
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
        _init_subtopic_progress(node.subtopics)


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
    """Finalizes the roadmap skeleton for review. Per the user's "don't
    generate the quiz right now" request, no node's project + final quiz
    are attached here any more, for either path type - they're deferred
    all the way to generate_final_content, triggered once a node's
    subtopics are all resolved (see main.py's _maybe_generate_final_content).
    PATH_B_OPEN_WEB nodes DO get their resources (cheat_sheet_notes/
    web_sources/youtube_links) filled eagerly via run_path_b below - useful
    to browse before starting, and cheap (one search+synthesis call,
    already required regardless of when project/quiz generate)."""
    if state.roadmap is None:
        raise ValueError(
            "Roadmap Generator requires state.roadmap to already exist (Path-A must run first)"
        )

    client = llm_client or LLMClient()

    dataset_nodes = [n for n in state.roadmap.nodes if n.path_type == PathType.PATH_A_DATASET]
    web_nodes = [n for n in state.roadmap.nodes if n.path_type == PathType.PATH_B_OPEN_WEB]
    # Was this roadmap's topic list reused from the cross-user template
    # cache? Can't infer that from node.project any more (nothing attaches
    # project eagerly for dataset nodes now) - read it off Path-A's own log
    # entry instead, which is unambiguous about which branch it took.
    path_a_events = [e for e in state.progress_log if e.agent == AgentName.PATH_A]
    was_reused = bool(path_a_events) and path_a_events[-1].event_type == "roadmap_reused_from_template"

    for node in web_nodes:
        if node.cheat_sheet_notes is not None:
            continue  # already populated - reused from a template
        # Fills cheat_sheet_notes/web_sources/youtube_links via web search +
        # synthesis - project/quiz stay deferred, see path_b.py's docstring.
        run_path_b(state, node_id=node.node_id, llm_client=client)

    state.stage = ConversationStage.ROADMAP_REVIEW
    state.log(
        AgentName.ROADMAP_GENERATOR,
        "roadmap_finalized",
        detail=f"{len(state.roadmap.nodes)} nodes ({len(dataset_nodes)} dataset, {len(web_nodes)} web)",
    )

    if not was_reused and state.learner_profile.goal:
        _save_as_template(state)

    state.next_agent = AgentName.DONE
    return state
