"""
graph.py

LangGraph orchestrator. Build order step 5 built the routing with all-stub
agents (see build_stub_graph, kept as a standing regression test of the
wiring itself). Build order step 6 replaces stubs with real agents one at a
time in build_graph() below - the wiring/routing mechanics don't change,
only which function is registered for each node.

Routing is centralized: every node sets state.next_agent before returning,
and the same route_next() function reads it after every node.

Path A only for now. Path-B / Project Generator are not nodes yet; if
next_agent is ever set to one of those, LangGraph raises a KeyError rather
than silently no-op-ing - fail loud, per CLAUDE.md reliability requirements.

Explainer is NOT a node in this chain. Per docs/api_contract.md,
`/roadmap/explain/{node_id}` is an on-demand route - the user clicks "why
this?" on a specific node, so it needs a node_id argument the sequential
graph never has at the point Roadmap Generator finishes. It's called
directly as a function from that route (build order step 7), tested in
isolation like any other agent, just never chained here.
"""

from langgraph.graph import END, StateGraph

from backend.agents.assessment import run_assessment
from backend.agents.path_a import run_path_a
from backend.agents.profiler import run_profiler
from backend.agents.roadmap_generator import run_roadmap_generator
from backend.orchestrator.state_schema import AgentName, AppState

_REAL_NODES = [
    AgentName.PROFILER,
    AgentName.ASSESSMENT,
    AgentName.PATH_A,
    AgentName.ROADMAP_GENERATOR,
]


def _stub_node(agent: AgentName, next_agent: AgentName):
    def node(state: AppState) -> AppState:
        state.log(agent, "stub_run", f"stub - real {agent.value} agent not implemented yet")
        state.next_agent = next_agent
        return state

    return node


def route_next(state: AppState) -> str:
    return state.next_agent.value


def _wire(builder: StateGraph) -> None:
    # Conditional entry point, not a fixed one: a resumed session's state
    # already has next_agent pointing at wherever it paused (e.g. ASSESSMENT,
    # waiting on the learner's quiz answers) - a fixed entry point would
    # re-run Profiler from scratch on every /chat call instead of resuming.
    routing_map = {agent.value: agent.value for agent in _REAL_NODES}
    routing_map[AgentName.DONE.value] = END

    builder.set_conditional_entry_point(route_next, routing_map)

    for agent in _REAL_NODES:
        builder.add_conditional_edges(agent.value, route_next, routing_map)


def build_stub_graph():
    """All-stub graph - regression test of the routing mechanics only."""
    builder = StateGraph(AppState)

    stub_chain = _REAL_NODES + [AgentName.DONE]
    for agent, next_agent in zip(_REAL_NODES, stub_chain[1:]):
        builder.add_node(agent.value, _stub_node(agent, next_agent))

    _wire(builder)
    return builder.compile()


def build_graph():
    """The real graph. All four sequential agents are real as of build order
    step 6 (Explainer is deliberately not part of this chain - see module
    docstring)."""
    builder = StateGraph(AppState)

    builder.add_node(AgentName.PROFILER.value, run_profiler)
    builder.add_node(AgentName.ASSESSMENT.value, run_assessment)
    builder.add_node(AgentName.PATH_A.value, run_path_a)
    builder.add_node(AgentName.ROADMAP_GENERATOR.value, run_roadmap_generator)

    _wire(builder)
    return builder.compile()
