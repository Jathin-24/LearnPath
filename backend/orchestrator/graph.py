"""
graph.py

LangGraph orchestrator. Build order step 5 built the routing with all-stub
agents (see build_stub_graph, kept as a standing regression test of the
wiring itself). Build order step 6 replaces stubs with real agents one at a
time in build_graph() below - the wiring/routing mechanics don't change,
only which function is registered for each node.

Two separate routing functions, not one, because "where do we resume" and
"should this invocation stop" are different questions:
  - route_entry (conditional entry point): always trusts next_agent to pick
    where a resumed session starts - a paused agent points next_agent at
    ITSELF (e.g. Assessment mid-quiz sets next_agent=ASSESSMENT), so the next
    /chat call re-enters that same node with the learner's new message.
  - route_next (conditional edges, checked after a node runs): checks
    state.awaiting_input FIRST. If the node just paused (awaiting_input=True),
    route straight to END regardless of next_agent - otherwise a
    self-pointing next_agent would make LangGraph loop back into the same
    node again within this same invocation instead of stopping to wait for
    the learner. Only once awaiting_input is False does it fall through to
    next_agent, which is how Assessment -> Path-A -> Roadmap Generator still
    cascade automatically within one /chat call.
See state_schema.py's awaiting_input field docstring for the full reasoning
(this bug was caught live: a second /chat call was silently dropped because
next_agent="done" was being reused as the resume target, so the conditional
entry point routed straight to END instead of back into Assessment).

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


def route_entry(state: AppState) -> str:
    return state.next_agent.value


def route_next(state: AppState) -> str:
    if state.awaiting_input:
        return AgentName.DONE.value
    return state.next_agent.value


def _wire(builder: StateGraph) -> None:
    routing_map = {agent.value: agent.value for agent in _REAL_NODES}
    routing_map[AgentName.DONE.value] = END

    builder.set_conditional_entry_point(route_entry, routing_map)

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
