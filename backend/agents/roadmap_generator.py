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
    questions: list[MCQQuestion]


def _parse_json(raw_text: str) -> dict:
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


def _build_prompt(topic: str, course_summary: str | None) -> str:
    summary_clause = f": {course_summary}" if course_summary else ""
    return f"""Generate a checkpoint project and a short assessment quiz for a learner \
studying "{topic}"{summary_clause}.

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{
  "project_title": "short project title",
  "project_description": "2-3 sentences describing a hands-on project applying this topic",
  "questions": [
    {{"question": "...", "options": ["...", "...", "...", "..."], "correct_option_index": 0}}
  ]
}}
Write exactly {QUESTIONS_PER_NODE} questions, each with exactly 4 options."""


def _generate_node_content(client: LLMClient, topic: str, course_summary: str | None) -> NodeContentOutput:
    prompt = _build_prompt(topic, course_summary)

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
    was_reused = bool(dataset_nodes) and all(n.project is not None for n in dataset_nodes)

    for node in dataset_nodes:
        if node.project is not None:
            continue  # already populated - this roadmap was reused from a template
        content = _generate_node_content(client, node.topic, node.course_summary)
        node.project = ProjectAssignment(
            title=content.project_title, description=content.project_description
        )
        node.assessment = TopicAssessment(questions=content.questions)

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
