"""
explainer.py

Explainer Agent: answers "why is this node in my roadmap?" - grounded in the
learner's actual profile/skill-gap data and this node's real position in the
prerequisite graph, never a generic LLM guess (per docs/api_contract.md:
"must cite the actual reason this node is in the roadmap"). Called on demand
via /roadmap/explain/{node_id} (build order step 7), not part of the
sequential orchestrator chain - see graph.py docstring for why.
"""

from backend.common.llm_client import LLMClient
from backend.orchestrator.state_schema import AppState
from backend.rag.retriever import load_courses


def explain_node(state: AppState, node_id: str, llm_client: LLMClient | None = None) -> str:
    if state.roadmap is None:
        raise ValueError("No roadmap exists yet for this session")
    node = state.roadmap.get_node(node_id)
    if node is None:
        raise ValueError(f"No node {node_id!r} in this roadmap")

    client = llm_client or LLMClient()

    dependents = [n.topic for n in state.roadmap.nodes if node_id in n.internal_prerequisites]
    prereq_topics = [
        p.topic for p in (state.roadmap.get_node(pid) for pid in node.internal_prerequisites) if p
    ]

    concepts: list[str] = []
    if node.course_name:
        courses = load_courses()
        concepts = courses.get(node.course_name, {}).get("concepts", [])

    addressed_gaps = [g for g in state.skill_gap_map.gaps() if g in concepts]

    prompt = f"""You are the Explainer Agent for a personalized learning path recommender. \
Explain to the learner, in 2-4 sentences and a warm but direct tone, why THIS specific topic \
is in their roadmap. Ground your answer ONLY in the facts below - do not invent reasons.

Learner's goal: {state.learner_profile.goal or "not specified"}
This topic: {node.topic}
{f"Course summary: {node.course_summary}" if node.course_summary else ""}
Concepts this topic covers: {", ".join(concepts) if concepts else "not specified"}
Skill gaps (from their assessment) this topic addresses: \
{", ".join(addressed_gaps) if addressed_gaps else "none directly identified"}
Prerequisites this topic requires first: {", ".join(prereq_topics) if prereq_topics else "none"}
Topics that require THIS one as a prerequisite: {", ".join(dependents) if dependents else "none yet"}

Write the explanation directly to the learner ("you"), no preamble, no JSON - plain text only."""

    return client.complete(prompt, max_tokens=400).strip()
