"""
main.py

FastAPI app entrypoint. Routes here are thin wrappers only - no business logic
lives in this file. Each route's job is: parse request -> call into
orchestrator/db/rag layer -> shape response. See docs/api_contract.md for the
full route spec.

Build order status (see CLAUDE.md): all six build steps are wired as of this
file - skeleton, shared state schema, Postgres, RAG, orchestrator, agents.
/chat drives the sequential graph (Profiler -> Assessment -> Path-A ->
Roadmap Generator), resuming wherever the session last paused (see
orchestrator/graph.py's conditional entry point). /roadmap/generate/path-a
is a separate explicit trigger that calls Path-A + Roadmap Generator
directly, bypassing the conversational chain - per docs/api_contract.md this
is its own route, not just an internal side effect of /chat.
"""

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.agents.explainer import explain_node as run_explainer
from backend.agents.path_a import run_path_a
from backend.agents.roadmap_generator import run_roadmap_generator
from backend.common import db
from backend.common.llm_client import LLMClient
from backend.orchestrator.graph import build_graph
from backend.orchestrator.state_schema import AgentName, AppState, ConversationStage, NodeStatus


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="Learning Path Recommender API", lifespan=lifespan)

# Dev-only: allow the Vite dev server to call this API. Tighten to the real
# deployed frontend origin before shipping.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _not_implemented(step: str) -> HTTPException:
    return HTTPException(
        status_code=501,
        detail=f"Not implemented yet - waiting on: {step}",
    )


def _load_or_404(session_id: str) -> AppState:
    state = db.load_state(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"No session found for {session_id}")
    return state


class SessionIdRequest(BaseModel):
    session_id: str


@app.get("/health")
def health():
    llm_status = []
    llm_error = None
    try:
        llm_status = LLMClient().status()
    except ValueError as exc:
        llm_error = str(exc)

    return {
        "status": "ok",
        "llm_endpoints": llm_status,
        "llm_config_error": llm_error,
    }


@app.post("/session")
def create_session():
    state = AppState(session_id=str(uuid.uuid4()))
    db.create_session(state)
    return {"session_id": state.session_id, "state": state}


class ChatRequest(BaseModel):
    session_id: str
    message: str


@app.post("/chat")
def chat(payload: ChatRequest):
    state = _load_or_404(payload.session_id)
    state.last_user_message = payload.message
    turns_before = len(state.conversation_history)

    graph = build_graph()
    try:
        result = graph.invoke(state)
    except Exception as exc:
        # Agents fail loud on bad LLM output after one retry (per
        # docs/final_decisions.md reliability requirements) - that's correct
        # internally, but this is the API boundary: never let it crash the
        # connection with no response (which browsers misreport as a CORS
        # error). Degrade gracefully instead; the session in Postgres is
        # untouched since we never reached db.save_state below.
        raise HTTPException(
            status_code=502,
            detail="The assistant had trouble processing that - please try again.",
        ) from exc
    new_state = AppState.model_validate(dict(result))

    if len(new_state.conversation_history) > turns_before:
        assistant_message = new_state.conversation_history[-1].content
    elif new_state.stage == ConversationStage.ROADMAP_REVIEW and new_state.roadmap:
        assistant_message = (
            f"Your roadmap is ready with {len(new_state.roadmap.nodes)} topics. "
            "Review it and confirm when you're ready to start."
        )
    else:
        assistant_message = ""

    db.save_state(new_state)
    return {"state": new_state, "assistant_message": assistant_message}


class ImportContextRequest(BaseModel):
    session_id: str
    imported_text: str


@app.post("/context/import")
def import_context(payload: ImportContextRequest):
    state = _load_or_404(payload.session_id)
    state.learner_profile.imported_context_raw = payload.imported_text
    db.save_state(state)
    return {"state": state}


@app.get("/state/{session_id}")
def get_state(session_id: str):
    return {"state": _load_or_404(session_id)}


@app.post("/roadmap/generate/path-a")
def generate_path_a(payload: SessionIdRequest):
    state = _load_or_404(payload.session_id)
    state = run_path_a(state)
    state = run_roadmap_generator(state)
    db.save_state(state)
    return {"roadmap": state.roadmap, "path_type": state.roadmap.path_type}


@app.post("/roadmap/confirm")
def confirm_roadmap(payload: SessionIdRequest):
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap to confirm for this session")

    state.stage = ConversationStage.IN_PROGRESS
    for node in state.roadmap.nodes:
        if node.status == NodeStatus.LOCKED and not node.internal_prerequisites:
            node.status = NodeStatus.AVAILABLE

    state.log(AgentName.ORCHESTRATOR, "roadmap_confirmed", detail=f"{len(state.roadmap.nodes)} nodes")
    db.save_state(state)
    return {"state": state}


@app.post("/roadmap/explain/{node_id}")
def explain_roadmap_node(node_id: str, payload: SessionIdRequest):
    state = _load_or_404(payload.session_id)
    try:
        explanation = run_explainer(state, node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"explanation": explanation}


class AssessmentSubmitRequest(BaseModel):
    session_id: str
    answers: list[str]  # one selected option string per question, in order


def _unlock_dependents(state: AppState, completed_node_id: str) -> None:
    for node in state.roadmap.nodes:
        if completed_node_id not in node.internal_prerequisites or node.status != NodeStatus.LOCKED:
            continue
        unmet = [
            prereq_id
            for prereq_id in node.internal_prerequisites
            if (prereq := state.roadmap.get_node(prereq_id)) and prereq.status != NodeStatus.COMPLETE
        ]
        if not unmet:
            node.status = NodeStatus.AVAILABLE


@app.post("/topic/{node_id}/assessment/submit")
def submit_assessment(node_id: str, payload: AssessmentSubmitRequest):
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")
    node = state.roadmap.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"No node {node_id!r} in this roadmap")
    if node.assessment is None:
        raise HTTPException(status_code=400, detail=f"Node {node_id!r} has no assessment")

    questions = node.assessment.questions
    correct = sum(
        1
        for q, a in zip(questions, payload.answers)
        if 0 <= q.correct_option_index < len(q.options) and a == q.options[q.correct_option_index]
    )
    score = correct / len(questions) if questions else 0.0
    passed = score >= node.assessment.pass_threshold

    node.assessment.last_score = score
    node.assessment.attempts += 1

    if passed:
        node.status = NodeStatus.COMPLETE
        _unlock_dependents(state, node_id)

    state.log(
        AgentName.ASSESSMENT,
        "topic_assessment_submitted",
        detail=f"{node_id}: {score:.2f} ({'pass' if passed else 'fail'})",
    )
    db.save_state(state)
    return {"score": score, "passed": passed, "node_status": node.status}


@app.get("/dashboard/{session_id}")
def dashboard(session_id: str):
    state = _load_or_404(session_id)
    skill_radar = {a.concept: a.status.value for a in state.skill_gap_map.assessments}
    current_node = None
    percent_complete = 0.0
    next_action = "Say hello to get started."

    if state.roadmap is not None:
        percent_complete = state.roadmap.percent_complete()
        if state.roadmap.current_node_id:
            current_node = state.roadmap.get_node(state.roadmap.current_node_id)
        available = [n for n in state.roadmap.nodes if n.status == NodeStatus.AVAILABLE]
        if available:
            next_action = f"Start '{available[0].topic}'."
        elif state.stage == ConversationStage.ROADMAP_REVIEW:
            next_action = "Review and confirm your roadmap."
        elif percent_complete >= 100.0:
            next_action = "Roadmap complete - nice work!"

    return {
        "percent_complete": percent_complete,
        "skill_radar": skill_radar,
        "current_node": current_node,
        "next_recommended_action": next_action,
    }
