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

import io
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pypdf import PdfReader

from backend.agents.explainer import explain_node as run_explainer
from backend.agents.path_a import run_path_a
from backend.agents.roadmap_generator import run_roadmap_generator
from backend.common import db
from backend.common.llm_client import LLMClient
from backend.orchestrator.graph import build_graph
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    ChatTurn,
    ConversationStage,
    NodeStatus,
    PathType,
)


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


class SignupRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/auth/signup")
def signup(payload: SignupRequest):
    if not payload.username.strip() or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    if db.get_user_by_username(payload.username) is not None:
        raise HTTPException(status_code=409, detail="Username already taken")

    password_hash = bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode()
    user_id = db.create_user(payload.username, password_hash)

    state = AppState(session_id=str(uuid.uuid4()))
    db.create_session(state, user_id=user_id)
    return {"user_id": user_id, "username": payload.username, "session_id": state.session_id}


@app.post("/auth/login")
def login(payload: LoginRequest):
    user = db.get_user_by_username(payload.username)
    if user is None or not bcrypt.checkpw(payload.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    session_id = db.get_session_id_for_user(user["user_id"])
    if session_id is None:
        # Shouldn't normally happen (signup always creates one) - don't
        # strand a valid user without a session if it does.
        state = AppState(session_id=str(uuid.uuid4()))
        db.create_session(state, user_id=user["user_id"])
        session_id = state.session_id

    return {"user_id": user["user_id"], "username": user["username"], "session_id": session_id}


class ChatRequest(BaseModel):
    session_id: str
    message: str


@app.post("/chat")
def chat(payload: ChatRequest):
    state = _load_or_404(payload.session_id)

    # Stay single-topic-focused: once a roadmap exists and is active, don't
    # let a stray chat message quietly try to start a second goal/roadmap -
    # that's exactly the "overloading of information" the user asked to
    # avoid. Redirect deterministically instead of invoking the graph at all.
    if state.stage in (ConversationStage.ROADMAP_REVIEW, ConversationStage.IN_PROGRESS):
        redirect = (
            f"You're currently working through your roadmap"
            f"{f' for {state.learner_profile.goal!r}' if state.learner_profile.goal else ''}. "
            "Let's finish that one topic at a time - head to your Dashboard to continue, "
            "or visit your Profile if you want to start fresh with a new goal."
        )
        state.conversation_history.append(ChatTurn(role="user", content=payload.message))
        state.conversation_history.append(ChatTurn(role="assistant", content=redirect))
        db.save_state(state)
        return {"state": state, "assistant_message": redirect}

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


@app.post("/profile/resume")
async def upload_resume(session_id: str = Form(...), file: UploadFile = File(...)):
    state = _load_or_404(session_id)
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported right now")

    raw_bytes = await file.read()
    try:
        reader = PdfReader(io.BytesIO(raw_bytes))
        text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Couldn't read that PDF") from exc

    if not text:
        raise HTTPException(status_code=400, detail="No extractable text found in that PDF")

    state.learner_profile.resume_raw = text
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
    _unlock_next_in_sequence(state)

    state.log(AgentName.ORCHESTRATOR, "roadmap_confirmed", detail=f"{len(state.roadmap.nodes)} nodes")
    db.save_state(state)
    return {"state": state}


class ReorderRequest(BaseModel):
    session_id: str
    node_id: str
    direction: str  # "up" | "down"


@app.post("/roadmap/reorder")
def reorder_roadmap_node(payload: ReorderRequest):
    """Only LOCKED (not-yet-started) topics can be reordered - completed/
    available/in-progress topics stay put, keeping the sequential-unlock
    model (backend/api/main.py's _unlock_next_in_sequence) intact."""
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")

    nodes = state.roadmap.nodes
    idx = next((i for i, n in enumerate(nodes) if n.node_id == payload.node_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"No node {payload.node_id!r} in this roadmap")
    if nodes[idx].status != NodeStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Only upcoming (locked) topics can be reordered")

    step = {"up": -1, "down": 1}.get(payload.direction)
    if step is None:
        raise HTTPException(status_code=400, detail="direction must be 'up' or 'down'")

    swap_idx = idx + step
    if not (0 <= swap_idx < len(nodes)) or nodes[swap_idx].status != NodeStatus.LOCKED:
        raise HTTPException(status_code=400, detail="No locked neighbor in that direction")

    nodes[idx], nodes[swap_idx] = nodes[swap_idx], nodes[idx]
    db.save_state(state)
    return {"state": state}


@app.post("/roadmap/skip/{node_id}")
def skip_roadmap_node(node_id: str, payload: SessionIdRequest):
    """Removes a LOCKED (not-yet-started) topic entirely and strips it from
    every other node's internal_prerequisites so nothing dangles."""
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")
    node = state.roadmap.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"No node {node_id!r} in this roadmap")
    if node.status != NodeStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Only upcoming (locked) topics can be skipped")

    state.roadmap.nodes = [n for n in state.roadmap.nodes if n.node_id != node_id]
    for other in state.roadmap.nodes:
        if node_id in other.internal_prerequisites:
            other.internal_prerequisites.remove(node_id)

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


def _unlock_next_in_sequence(state: AppState) -> None:
    """Exactly one node AVAILABLE at a time, in roadmap order (already
    topologically sorted by Path-A) - not "everything whose prerequisites
    are met," per the user's explicit "complete everything one by one"
    request. PATH_B_OPEN_WEB stub nodes are skipped: they have no way to be
    completed until Path-B exists, so leaving them in the sequence would
    permanently deadlock progression the first time one comes up."""
    for node in state.roadmap.nodes:
        if node.path_type == PathType.PATH_B_OPEN_WEB:
            continue
        if node.status == NodeStatus.COMPLETE:
            continue
        if node.status == NodeStatus.LOCKED:
            node.status = NodeStatus.AVAILABLE
        break  # first non-complete dataset node found, unlocked or not - stop


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
    if node.status != NodeStatus.AVAILABLE:
        raise HTTPException(
            status_code=400,
            detail=f"Node {node_id!r} isn't the current topic - complete topics one at a time",
        )

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
        node.completed_at = datetime.now(timezone.utc)
        _unlock_next_in_sequence(state)

    state.log(
        AgentName.ASSESSMENT,
        "topic_assessment_submitted",
        detail=f"{node_id}: {score:.2f} ({'pass' if passed else 'fail'})",
    )
    db.save_state(state)
    return {"score": score, "passed": passed, "node_status": node.status}


class TimeSpentRequest(BaseModel):
    session_id: str
    seconds: int


@app.post("/topic/{node_id}/time")
def record_time_spent(node_id: str, payload: TimeSpentRequest):
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")
    node = state.roadmap.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"No node {node_id!r} in this roadmap")

    node.time_spent_seconds += max(0, payload.seconds)
    db.save_state(state)
    return {"time_spent_seconds": node.time_spent_seconds}


class ProfileUpdateRequest(BaseModel):
    session_id: str
    name: str | None = None
    email: str | None = None
    age: int | None = None
    gender: str | None = None
    occupation_status: str | None = None
    student_percentage: str | None = None
    professional_role: str | None = None
    goal: str | None = None
    timeline: str | None = None
    interests: list[str] | None = None
    stated_known_skills: list[str] | None = None
    prior_learning_history: list[str] | None = None


@app.patch("/profile")
def update_profile(payload: ProfileUpdateRequest):
    state = _load_or_404(payload.session_id)
    profile = state.learner_profile

    if payload.name is not None:
        profile.name = payload.name
    if payload.email is not None:
        profile.email = payload.email
    if payload.age is not None:
        profile.age = payload.age
    if payload.gender is not None:
        profile.gender = payload.gender
    if payload.occupation_status is not None:
        if payload.occupation_status not in ("student", "working_professional"):
            raise HTTPException(
                status_code=400,
                detail="occupation_status must be 'student' or 'working_professional'",
            )
        profile.occupation_status = payload.occupation_status
    if payload.student_percentage is not None:
        profile.student_percentage = payload.student_percentage
    if payload.professional_role is not None:
        profile.professional_role = payload.professional_role
    if payload.goal is not None:
        profile.goal = payload.goal
    if payload.timeline is not None:
        profile.timeline = payload.timeline
    if payload.interests is not None:
        profile.interests = payload.interests
    if payload.stated_known_skills is not None:
        profile.stated_known_skills = payload.stated_known_skills
    if payload.prior_learning_history is not None:
        profile.prior_learning_history = payload.prior_learning_history

    db.save_state(state)
    return {"state": state}


@app.get("/analytics/{session_id}")
def analytics(session_id: str):
    state = _load_or_404(session_id)

    attempted_nodes = 0
    passed_nodes = 0
    total_time_seconds = 0
    completed_this_week = 0
    completed_total = 0
    scores: list[float] = []
    per_topic_time: list[dict] = []
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    dataset_nodes = [n for n in (state.roadmap.nodes if state.roadmap else []) if n.assessment is not None]

    for node in dataset_nodes:
        total_time_seconds += node.time_spent_seconds
        if node.time_spent_seconds > 0:
            per_topic_time.append({"topic": node.topic, "seconds": node.time_spent_seconds})
        if node.assessment.attempts > 0:
            attempted_nodes += 1
            if node.status == NodeStatus.COMPLETE:
                passed_nodes += 1
        if node.status == NodeStatus.COMPLETE:
            completed_total += 1
            if node.assessment.last_score is not None:
                scores.append(node.assessment.last_score)
        if node.completed_at is not None:
            completed_at = node.completed_at
            if completed_at.tzinfo is None:
                completed_at = completed_at.replace(tzinfo=timezone.utc)
            if completed_at >= week_ago:
                completed_this_week += 1

    # Fraction of attempted topics eventually passed - not attempts/passes,
    # since TopicAssessment only tracks a running attempt count + last_score,
    # not a per-attempt pass/fail history.
    pass_rate = (passed_nodes / attempted_nodes) if attempted_nodes else 0.0
    average_score = (sum(scores) / len(scores)) if scores else 0.0

    skill_summary = {"known": 0, "learned": 0, "claimed_unconfirmed": 0, "gap": 0}
    for assessment in state.skill_gap_map.assessments:
        skill_summary[assessment.status.value] += 1

    return {
        "quiz_pass_rate": round(pass_rate, 2),
        "topics_completed_this_week": completed_this_week,
        "total_time_spent_seconds": total_time_seconds,
        "topics_total": len(dataset_nodes),
        "topics_completed": completed_total,
        "average_score": round(average_score, 2),
        "per_topic_time": sorted(per_topic_time, key=lambda t: -t["seconds"]),
        "skill_summary": skill_summary,
    }


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
