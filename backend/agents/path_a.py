"""
path_a.py

Path-A Agent: RAG retrieval + LLM planning + prerequisite traversal over the
80-course dataset -> dataset-grounded roadmap nodes.

  1. RAG-retrieve candidate courses from learner_profile.goal + skill_gap_map.gaps()
  2. Drop candidates below MIN_SIMILARITY_SCORE - the embedding model doesn't
     cleanly separate "genuinely relevant" from "loosely related": live
     testing on "become a backend developer" showed real matches scoring
     0.36-0.59 and noise (Android App Development, React Native Mobile
     Development, even Ethical Hacking Basics) sitting at 0.28-0.32 with no
     clear boundary a human would trust from vector math alone.
  3. LLM planning pass over the survivors: pure similarity still isn't
     precise enough (a mobile-dev course can score above the noise floor by
     accident), so an LLM call selects/justifies which candidates actually
     fit this learner's stated goal, timeline, and interests - this is the
     "plan the path based on the user's requirement" step.
  4. Walk internal_prerequisites transitively so no course's prerequisite is
     left out, then topologically sort the result.
  5. external_prerequisite_concepts hit along the way become Path-B stub
     nodes (path_type=PATH_B_OPEN_WEB, unfilled - Path-B agent isn't built
     yet) and get promoted from "informational" to a real prerequisite edge.

Before any of that: check for a previously-generated roadmap with a very
similar goal (backend/common/db.py's roadmap_templates cache) and reuse it
wholesale if found - skips steps 1-5 and the LLM planning + per-node
generation cost entirely. Roadmap Generator (next agent) is what actually
writes a fresh roadmap into that cache once it finishes attaching
projects/assessments - see its module docstring.
"""

import json
from collections import deque

from pydantic import BaseModel, ValidationError

from backend.agents.path_b import run_path_b
from backend.common import db
from backend.common.llm_client import LLMClient
from backend.common.slugify import slugify
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    NodeStatus,
    PathType,
    Roadmap,
    RoadmapNode,
)
from backend.rag.retriever import embed_text, load_courses, retrieve

SEED_K = 15
MIN_SIMILARITY_SCORE = 0.35
TEMPLATE_SIMILARITY_THRESHOLD = 0.85


def _build_query(state: AppState) -> str:
    goal = state.learner_profile.goal or ""
    gaps = state.skill_gap_map.gaps()
    parts = [p for p in [goal, *gaps] if p]
    return ". ".join(parts) or "general programming fundamentals"


def _parse_json(raw_text: str) -> dict:
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


class PlannedCourse(BaseModel):
    course_name: str
    reason: str


class RoadmapPlanOutput(BaseModel):
    selected_courses: list[PlannedCourse]


def _build_planning_prompt(state: AppState, candidates: list[dict]) -> str:
    candidate_summaries = [
        {
            "course_name": c["course_name"],
            "difficulty": c.get("difficulty"),
            "concepts": c.get("concepts", [])[:8],
            "summary": c.get("summary"),
        }
        for c in candidates
    ]
    profile = state.learner_profile
    return f"""You are planning a personalized learning roadmap. Learner's goal: \
{profile.goal or "not specified"}
Timeline: {profile.timeline or "not specified"}
Interests: {", ".join(profile.interests) or "not specified"}

Candidate courses (already filtered for topical similarity, but similarity search \
alone isn't precise enough - some may not genuinely fit):
{json.dumps(candidate_summaries, indent=2)}

Select ONLY the courses that genuinely belong in a roadmap for THIS person's stated \
goal and timeline. Exclude anything off-topic (e.g. a mobile app development course \
doesn't belong in a backend-developer roadmap just because it shares some tech). \
It's fine to select fewer courses than were given - never pad the list.

Respond with ONLY a JSON object (no markdown fences, no preamble):
{{
  "selected_courses": [
    {{"course_name": "exact name from the candidates above", "reason": "one short sentence"}}
  ]
}}"""


def _plan_with_llm(client: LLMClient, state: AppState, candidates: list[dict]) -> list[str]:
    prompt = _build_planning_prompt(state, candidates)
    candidate_names = {c["course_name"] for c in candidates}

    def attempt(p: str) -> list[str]:
        output = RoadmapPlanOutput.model_validate(_parse_json(client.complete(p, max_tokens=1200)))
        names = [c.course_name for c in output.selected_courses if c.course_name in candidate_names]
        if not names:
            raise ValueError("LLM selected zero valid candidates")
        return names

    try:
        return attempt(prompt)
    except (json.JSONDecodeError, ValidationError, ValueError):
        stricter = prompt + (
            "\n\nRespond with ONLY valid JSON, and select at least one course from "
            "the exact candidate list above."
        )
        return attempt(stricter)  # let this raise if it fails again - fail loud


def _expand_with_prerequisites(seed_names: list[str], courses: dict) -> set[str]:
    selected: set[str] = set()
    stack = list(seed_names)
    while stack:
        name = stack.pop()
        if name in selected or name not in courses:
            continue
        selected.add(name)
        stack.extend(courses[name].get("internal_prerequisites", []))
    return selected


def _topological_order(selected: set[str], courses: dict) -> list[str]:
    in_degree = {name: 0 for name in selected}
    dependents: dict[str, list[str]] = {name: [] for name in selected}
    for name in selected:
        for prereq in courses[name].get("internal_prerequisites", []):
            if prereq in selected:
                dependents[prereq].append(name)
                in_degree[name] += 1

    queue = deque(sorted(n for n in selected if in_degree[n] == 0))
    order: list[str] = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for dependent in sorted(dependents[node]):
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                queue.append(dependent)

    if len(order) != len(selected):
        raise ValueError(
            f"prerequisite cycle detected among: {selected - set(order)}"
        )
    return order


def _try_reuse_template(state: AppState, query: str) -> AppState | None:
    embedding = embed_text(query)
    template = db.find_similar_template(embedding, threshold=TEMPLATE_SIMILARITY_THRESHOLD)
    if template is None:
        return None

    reused_nodes = [
        RoadmapNode.model_validate({**node, "status": NodeStatus.LOCKED.value})
        for node in template["nodes_json"]
    ]
    state.roadmap = Roadmap(path_type=PathType.PATH_A_DATASET, nodes=reused_nodes)
    state.log(
        AgentName.PATH_A,
        "roadmap_reused_from_template",
        detail=f"matched template for goal: {template['goal_text']!r}",
    )
    state.next_agent = AgentName.ROADMAP_GENERATOR
    return state


def run_path_a(
    state: AppState, llm_client: LLMClient | None = None, use_template_cache: bool = True
) -> AppState:
    query = _build_query(state)

    if use_template_cache:
        reused = _try_reuse_template(state, query)
        if reused is not None:
            return reused

    courses = load_courses()
    client = llm_client or LLMClient()

    seeds_raw = retrieve(query, k=SEED_K)
    candidates = [r for r in seeds_raw if r["score"] >= MIN_SIMILARITY_SCORE]
    if not candidates:
        # Nothing in the 80-course dataset genuinely fits this goal - forcing
        # the top-3 weak matches produced irrelevant roadmaps in practice
        # (see MIN_SIMILARITY_SCORE's history above). Fall back to Path-B
        # (web/YouTube-sourced) for the whole goal instead.
        state.log(AgentName.PATH_A, "dataset_match_too_weak", detail="falling back to Path-B")
        return run_path_b(state, llm_client=client)

    approved_names = _plan_with_llm(client, state, candidates)

    selected = _expand_with_prerequisites(approved_names, courses)
    order = _topological_order(selected, courses)

    nodes: dict[str, RoadmapNode] = {}
    for name in order:
        profile = courses[name]
        node_id = slugify(name)
        nodes[node_id] = RoadmapNode(
            node_id=node_id,
            topic=name,
            path_type=PathType.PATH_A_DATASET,
            course_name=name,
            course_search_link=profile.get("search_link"),
            course_summary=profile.get("summary"),
            internal_prerequisites=[
                slugify(p) for p in profile.get("internal_prerequisites", []) if p in selected
            ],
            external_prerequisite_concepts=list(profile.get("external_prerequisite_concepts", [])),
            key_concepts=list(profile.get("concepts", []))[:5],  # main ones, not exhaustive
        )

    # Promote external concepts hit by selected courses into real Path-B stub
    # nodes + prerequisite edges, per api_contract.md step 4.
    external_concepts: dict[str, list[str]] = {}
    for name in order:
        for concept in courses[name].get("external_prerequisite_concepts", []):
            external_concepts.setdefault(concept, []).append(name)

    for concept, dependents in external_concepts.items():
        concept_id = slugify(concept)
        if concept_id not in nodes:
            nodes[concept_id] = RoadmapNode(
                node_id=concept_id, topic=concept, path_type=PathType.PATH_B_OPEN_WEB
            )
        for dependent_name in dependents:
            dependent_node = nodes[slugify(dependent_name)]
            if concept_id not in dependent_node.internal_prerequisites:
                dependent_node.internal_prerequisites.append(concept_id)
            if concept in dependent_node.external_prerequisite_concepts:
                dependent_node.external_prerequisite_concepts.remove(concept)

    ordered_ids = [slugify(c) for c in external_concepts] + [slugify(n) for n in order]
    roadmap_nodes = [nodes[node_id] for node_id in ordered_ids]

    state.roadmap = Roadmap(path_type=PathType.PATH_A_DATASET, nodes=roadmap_nodes)
    state.log(AgentName.PATH_A, "roadmap_nodes_generated", detail=f"{len(roadmap_nodes)} nodes")
    state.next_agent = AgentName.ROADMAP_GENERATOR
    return state
