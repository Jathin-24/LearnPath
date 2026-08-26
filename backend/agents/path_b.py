"""
path_b.py

Path-B Agent: web/YouTube-sourced content for anything the 80-course
dataset doesn't cover. Fills the PATH_B_OPEN_WEB stub nodes Path-A already
creates for external_prerequisite_concepts (see path_a.py's
_promote external concepts step), or builds a standalone sequenced topic
list when Path-A's dataset match is too weak for the whole goal (see
path_a.py's run_path_a fallback branch). Also used on-demand - a "Find
more resources" action on any node, dataset or web-sourced.

Two Tavily searches per topic (general web + YouTube-scoped), then LLM
synthesis - same fail-loud retry-once pattern as every other agent
(docs/final_decisions.md). Two shapes of fill, not one, because a node
that already has a dataset-grounded project/quiz (a Path-A node, or a
previously-filled Path-B node) must never have that overwritten just
because the learner asked for more resources:

  - _fill_node: an EMPTY stub (node.project is None) gets full content -
    cheat sheet notes, web sources, YouTube links, AND a fresh project/quiz.
  - _supplement_node: a node that already has content only gets its
    resources (notes/sources/links) added or refreshed - project/quiz
    untouched.

Standalone mode only creates bare stub nodes (topic + path_type, no
content yet) - filling each one's content happens through the SAME
_fill_node path as any other stub, via roadmap_generator.py's per-node
loop calling back into run_path_b(node_id=...). One content-filling code
path, not two.
"""

import json

from pydantic import BaseModel, ValidationError
from tavily import TavilyClient

from backend.common.config import get_settings
from backend.common.llm_client import LLMClient
from backend.common.slugify import slugify
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    MCQQuestion,
    PathType,
    ProjectAssignment,
    Roadmap,
    RoadmapNode,
    TopicAssessment,
)

QUESTIONS_PER_NODE = 3
MAX_WEB_RESULTS = 4
MAX_YOUTUBE_RESULTS = 3


def _search_client() -> TavilyClient:
    return TavilyClient(api_key=get_settings().tavily_api_key)


def _parse_json(raw_text: str) -> dict:
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


def _search_topic(search: TavilyClient, topic: str) -> tuple[list[dict], list[str]]:
    web = search.search(f"{topic} tutorial guide", max_results=MAX_WEB_RESULTS)
    youtube = search.search(
        f"{topic} tutorial",
        max_results=MAX_YOUTUBE_RESULTS,
        include_domains=["youtube.com", "youtu.be"],
    )
    web_results = web.get("results", [])
    youtube_links = [r["url"] for r in youtube.get("results", []) if r.get("url")]
    return web_results, youtube_links


def _synthesize_notes(client: LLMClient, topic: str, web_results: list[dict]) -> str:
    sources = "\n\n".join(
        f"Source: {r['title']} ({r['url']})\n{r.get('content', '')[:800]}" for r in web_results
    ) or "(no search results found - use general knowledge, note that clearly)"
    prompt = f"""Write a concise study guide (200-400 words) on "{topic}" for a learner, \
grounded in the web search results below where possible. Plain text, no markdown headers, \
just clear prose a learner can study from directly.

Search results:
{sources}"""
    return client.complete(prompt, max_tokens=700).strip()


class ProjectAndQuizOutput(BaseModel):
    project_title: str
    project_description: str
    success_criteria: list[str]
    questions: list[MCQQuestion]
    estimated_days: int


def _generate_project_and_quiz(
    client: LLMClient, topic: str, notes: str, timeline: str | None
) -> ProjectAndQuizOutput:
    timeline_clause = f" The learner's overall timeline is: {timeline}." if timeline else ""
    prompt = f"""Generate a checkpoint project and a short assessment quiz for a learner \
studying "{topic}" from the study notes below (web-sourced material, not in our course \
dataset).{timeline_clause} The quiz MUST be answerable from these notes alone - do not test \
facts that aren't actually covered here, even if you know them from elsewhere; a quiz question \
that contradicts or goes beyond what the learner was just shown is worse than no question.

Study notes the learner just read:
{notes}

Respond with ONLY a JSON object (no markdown fences, no preamble) in this exact shape:
{{
  "project_title": "short project title",
  "project_description": "2-3 sentences describing a hands-on project applying this topic",
  "success_criteria": ["2-4 short, concrete bullet points describing what a completed, working \
version of the project looks like"],
  "questions": [
    {{"question": "...", "options": ["...", "...", "...", "..."], "correct_option_index": 0, \
"explanation": "one sentence on why that answer is correct, citing the notes above"}}
  ],
  "estimated_days": 5
}}
Write exactly {QUESTIONS_PER_NODE} questions, each with exactly 4 options and an explanation."""

    def attempt(p: str) -> ProjectAndQuizOutput:
        output = ProjectAndQuizOutput.model_validate(_parse_json(client.complete(p, max_tokens=1500)))
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


def _apply_resources(node: RoadmapNode, notes: str, web_results: list[dict], youtube_links: list[str]) -> None:
    node.cheat_sheet_notes = notes
    node.web_sources = [r["url"] for r in web_results if r.get("url")]
    node.youtube_links = youtube_links


def _fill_node(state: AppState, node: RoadmapNode, client: LLMClient, search: TavilyClient) -> None:
    web_results, youtube_links = _search_topic(search, node.topic)
    notes = _synthesize_notes(client, node.topic, web_results)
    _apply_resources(node, notes, web_results, youtube_links)

    content = _generate_project_and_quiz(client, node.topic, notes, state.learner_profile.timeline)
    node.project = ProjectAssignment(
        title=content.project_title,
        description=content.project_description,
        success_criteria=content.success_criteria,
    )
    node.assessment = TopicAssessment(questions=content.questions)
    node.estimated_days = max(1, content.estimated_days)


def _supplement_node(state: AppState, node: RoadmapNode, client: LLMClient, search: TavilyClient) -> None:
    web_results, youtube_links = _search_topic(search, node.topic)
    notes = _synthesize_notes(client, node.topic, web_results)
    _apply_resources(node, notes, web_results, youtube_links)


class TopicPlanOutput(BaseModel):
    topics: list[str]


def _plan_standalone_topics(client: LLMClient, search: TavilyClient, goal: str) -> list[str]:
    web_results, _ = _search_topic(search, f"{goal} roadmap topics to learn in order")
    sources = "\n".join(
        f"- {r['title']}: {r.get('content', '')[:300]}" for r in web_results
    ) or "(no search results found - use general knowledge)"
    prompt = f"""A learner wants to: {goal}. Based on the web search results below, list 3-6 \
topics they should learn, in order, to achieve this goal. Keep topic names short and specific \
(not the goal itself restated).

Search results:
{sources}

Respond with ONLY a JSON object (no markdown fences, no preamble):
{{"topics": ["topic 1", "topic 2", ...]}}"""

    def attempt(p: str) -> list[str]:
        output = TopicPlanOutput.model_validate(_parse_json(client.complete(p, max_tokens=500)))
        if not output.topics:
            raise ValueError("no topics returned")
        return output.topics

    try:
        return attempt(prompt)
    except (json.JSONDecodeError, ValidationError, ValueError):
        stricter = prompt + "\n\nRespond with ONLY valid JSON, and list at least one topic."
        return attempt(stricter)  # let this raise if it fails again - fail loud


def run_path_b(
    state: AppState,
    node_id: str | None = None,
    llm_client: LLMClient | None = None,
    search_client: TavilyClient | None = None,
    force: bool = False,
) -> AppState:
    client = llm_client or LLMClient()
    search = search_client or _search_client()

    if node_id is not None:
        if state.roadmap is None:
            raise ValueError("No roadmap exists yet for this session")
        node = state.roadmap.get_node(node_id)
        if node is None:
            raise ValueError(f"No node {node_id!r} in this roadmap")

        if node.project is None or force:
            # force=True (roadmap_generator.py's regenerate_node_content) is
            # the third case alongside the two above: an explicit learner
            # request to rewrite project/quiz too, not just refresh
            # resources - same fill path as a brand-new stub.
            _fill_node(state, node, client, search)
            state.log(
                AgentName.PATH_B,
                "node_regenerated" if force else "node_filled_from_web",
                detail=node.topic,
            )
        else:
            _supplement_node(state, node, client, search)
            state.log(AgentName.PATH_B, "node_resources_refreshed", detail=node.topic)
        return state

    # Standalone: dataset match too weak for the whole goal - bare stub
    # nodes only, sequenced by internal_prerequisites. Content gets filled
    # the same way any PATH_B_OPEN_WEB stub does, via
    # roadmap_generator.py's per-node loop calling back in with node_id set.
    goal = state.learner_profile.goal or "general programming fundamentals"
    topics = _plan_standalone_topics(client, search, goal)

    nodes: list[RoadmapNode] = []
    prev_id: str | None = None
    for topic in topics:
        node_id_slug = slugify(topic)
        nodes.append(
            RoadmapNode(
                node_id=node_id_slug,
                topic=topic,
                path_type=PathType.PATH_B_OPEN_WEB,
                internal_prerequisites=[prev_id] if prev_id else [],
            )
        )
        prev_id = node_id_slug

    state.roadmap = Roadmap(path_type=PathType.PATH_B_OPEN_WEB, nodes=nodes)
    state.log(AgentName.PATH_B, "standalone_roadmap_generated", detail=f"{len(nodes)} nodes")
    state.next_agent = AgentName.ROADMAP_GENERATOR
    return state
