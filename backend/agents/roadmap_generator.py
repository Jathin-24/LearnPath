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

from backend.agents.path_b import run_path_b
from backend.common import db
from backend.common.llm_client import LLMClient
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    ConversationStage,
    MCQQuestion,
    PathType,
    ProjectAssignment,
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
    topic: str, course_summary: str | None, timeline: str | None, known_concepts: list[str]
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
studying "{topic}"{summary_clause}.{timeline_clause}{known_clause}

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
) -> NodeContentOutput:
    prompt = _build_prompt(topic, course_summary, timeline, known_concepts)

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
    for node in dataset_nodes:
        if node.project is not None:
            continue  # already populated - this roadmap was reused from a template
        content = _generate_node_content(
            client, node.topic, node.course_summary, state.learner_profile.timeline, known_concepts
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
