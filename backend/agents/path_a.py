"""
path_a.py

Path-A Agent: RAG retrieval + prerequisite traversal over the 80-course
dataset -> dataset-grounded roadmap nodes. Per docs/api_contract.md:
  1. RAG-retrieve seed courses from learner_profile.goal + skill_gap_map.gaps()
  2. Walk internal_prerequisites transitively so no course's prerequisite is
     left out of the roadmap, then topologically sort the result
  3. external_prerequisite_concepts hit along the way become Path-B stub
     nodes (path_type=PATH_B_OPEN_WEB, unfilled - Path-B agent isn't built
     yet) and get promoted from "informational" to a real prerequisite edge
     on whichever course needed them

Roadmap Generator (next agent) attaches projects/assessments per node and
finalizes state.stage - Path-A only builds the node graph.
"""

from collections import deque

from backend.common.slugify import slugify
from backend.orchestrator.state_schema import AgentName, AppState, PathType, Roadmap, RoadmapNode
from backend.rag.retriever import load_courses, retrieve

SEED_K = 8


def _build_query(state: AppState) -> str:
    goal = state.learner_profile.goal or ""
    gaps = state.skill_gap_map.gaps()
    parts = [p for p in [goal, *gaps] if p]
    return ". ".join(parts) or "general programming fundamentals"


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


def run_path_a(state: AppState) -> AppState:
    courses = load_courses()
    query = _build_query(state)
    seeds = [r["course_name"] for r in retrieve(query, k=SEED_K)]
    selected = _expand_with_prerequisites(seeds, courses)
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
