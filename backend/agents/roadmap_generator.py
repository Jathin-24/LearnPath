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
"""

import json

from pydantic import BaseModel, ValidationError

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
        output = NodeContentOutput.model_validate(_parse_json(client.complete(p, max_tokens=1000)))
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


def run_roadmap_generator(state: AppState, llm_client: LLMClient | None = None) -> AppState:
    if state.roadmap is None:
        raise ValueError(
            "Roadmap Generator requires state.roadmap to already exist (Path-A must run first)"
        )

    client = llm_client or LLMClient()

    for node in state.roadmap.nodes:
        if node.path_type != PathType.PATH_A_DATASET:
            continue  # Path-B stub nodes stay unfilled until the Path-B agent exists
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
    state.next_agent = AgentName.DONE
    return state
