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

from backend.agents.assessment import grade_pending_quiz, submit_checklist_concepts
from backend.agents.explainer import explain_node as run_explainer
from backend.agents.knowledge_extractor import extract_knowledge
from backend.agents.path_a import run_path_a
from backend.agents.path_b import run_path_b
from backend.agents.roadmap_generator import (
    ensure_subtopics,
    expand_project_description,
    regenerate_node_content,
    run_roadmap_generator,
)
from backend.agents.tutor import run_topic_tutor
from backend.common import db
from backend.common.grading import grade_mcq_batch
from backend.common.llm_client import LLMClient
from backend.common.slugify import slugify
from backend.orchestrator.graph import build_graph
from backend.orchestrator.state_schema import (
    AgentName,
    AppState,
    ChatTurn,
    ConversationStage,
    LearnerProfile,
    NodeStatus,
    PathType,
    RoadmapNode,
    SkillGapMap,
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

    state = AppState(session_id=str(uuid.uuid4()), user_id=user_id)
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
        state = AppState(session_id=str(uuid.uuid4()), user_id=user["user_id"])
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
    # invoke the full Profiler/Assessment graph again (which would try to
    # treat this as a second onboarding conversation). Instead, answer
    # through the Topic Tutor - grounded in the learner's current topic, and
    # only redirecting (in a natural reply, not a canned string) if they're
    # clearly trying to start something unrelated. See agents/tutor.py.
    if state.stage in (ConversationStage.ROADMAP_REVIEW, ConversationStage.IN_PROGRESS):
        state.conversation_history.append(ChatTurn(role="user", content=payload.message))
        reply = run_topic_tutor(state, payload.message)
        state.conversation_history.append(ChatTurn(role="assistant", content=reply, agent=AgentName.TUTOR))
        db.save_state(state)
        return {"state": state, "assistant_message": reply}

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


class ChecklistSubmitRequest(BaseModel):
    session_id: str
    confirmed_concepts: list[str]


@app.post("/assessment/checklist/submit")
def submit_checklist(payload: ChecklistSubmitRequest):
    """Structured alternative to typing an answer into /chat during the
    onboarding skill checklist - the frontend renders
    state.pending_checklist_concepts as checkboxes (see Chat.tsx) and posts
    the ones the learner ticked directly, so there's no free-text intent to
    misparse. See assessment.py's module docstring for why this replaced
    the old LLM-based extraction step."""
    state = _load_or_404(payload.session_id)
    if not state.pending_checklist_concepts:
        raise HTTPException(status_code=400, detail="No checklist pending for this session")

    client = LLMClient()
    try:
        state = submit_checklist_concepts(state, payload.confirmed_concepts, client)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Couldn't put your quiz together - please try again.",
        ) from exc

    # If nothing was confirmed, submit_checklist_concepts sets next_agent to
    # PATH_A directly (no quiz to generate) - invoke the graph so that
    # cascades into Path-A -> Roadmap Generator immediately, same as /chat
    # and /assessment/quiz/submit do. When a quiz WAS generated instead
    # (awaiting_input=True), this is a safe no-op pass-through: run_assessment
    # sees pending_quiz set and just stays paused.
    graph = build_graph()
    try:
        result = graph.invoke(state)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="The assistant had trouble processing that - please try again.",
        ) from exc
    new_state = AppState.model_validate(dict(result))

    db.save_state(new_state)
    return {"state": new_state}


class OnboardingQuizSubmitRequest(BaseModel):
    session_id: str
    answers: list[str]  # one selected option string per question, in order


@app.post("/assessment/quiz/submit")
def submit_onboarding_quiz(payload: OnboardingQuizSubmitRequest):
    """Structured alternative to typing answers into /chat for the
    onboarding skill quiz - grading is deterministic (grade_pending_quiz),
    then the graph is resumed from Path-A onward (same cascade /chat uses)
    since next_agent/awaiting_input are already set for that by grading."""
    state = _load_or_404(payload.session_id)
    if not state.pending_quiz:
        raise HTTPException(status_code=400, detail="No quiz pending for this session")

    results = grade_pending_quiz(state, payload.answers)
    state.next_agent = AgentName.PATH_A
    state.awaiting_input = False

    graph = build_graph()
    try:
        result = graph.invoke(state)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="The assistant had trouble building your roadmap - please try again.",
        ) from exc
    new_state = AppState.model_validate(dict(result))

    db.save_state(new_state)
    return {"state": new_state, "results": results}


class ImportContextRequest(BaseModel):
    session_id: str
    imported_text: str


def _extract_knowledge_best_effort(state: AppState, text: str, source: str) -> None:
    """Structured extraction is an enhancement on top of the raw text that's
    already saved - never let a parse/LLM failure break the caller's
    request (same philosophy as roadmap_generator.py's template caching)."""
    if not state.user_id:
        return
    try:
        entries = extract_knowledge(text, source)
        db.add_knowledge_entries(state.user_id, entries)
    except Exception as exc:
        state.log(AgentName.PROFILER, "knowledge_extraction_failed", detail=str(exc))


@app.post("/context/import")
def import_context(payload: ImportContextRequest):
    state = _load_or_404(payload.session_id)
    state.learner_profile.imported_context_raw = payload.imported_text
    _extract_knowledge_best_effort(state, payload.imported_text, source="import")
    db.save_state(state)
    return {"state": state}


@app.get("/knowledge/{session_id}")
def get_knowledge(session_id: str):
    state = _load_or_404(session_id)
    if not state.user_id:
        return {"entries": []}
    return {"entries": db.get_knowledge_for_user(state.user_id)}


class DeleteKnowledgeRequest(BaseModel):
    session_id: str


@app.delete("/knowledge/{entry_id}")
def delete_knowledge(entry_id: str, payload: DeleteKnowledgeRequest):
    state = _load_or_404(payload.session_id)
    if not state.user_id:
        raise HTTPException(status_code=400, detail="No knowledge base for this session")
    db.delete_knowledge_entry(entry_id, state.user_id)
    return {"deleted": entry_id}


@app.post("/goal/restart")
def restart_goal(payload: SessionIdRequest):
    """Start a fresh goal/roadmap - everything goal-specific (skills
    assessed, roadmap, conversation) resets so the new Profiler
    conversation starts clean, but identity fields (name/email/age/gender/
    occupation) carry over since those don't change per-goal. This is what
    the Tutor's mid-roadmap redirect and the Complete page both point the
    learner to."""
    state = _load_or_404(payload.session_id)
    identity = state.learner_profile
    state.learner_profile = LearnerProfile(
        name=identity.name,
        email=identity.email,
        age=identity.age,
        gender=identity.gender,
        occupation_status=identity.occupation_status,
        student_percentage=identity.student_percentage,
        professional_role=identity.professional_role,
    )
    state.skill_gap_map = SkillGapMap()
    state.roadmap = None
    state.conversation_history = []
    state.pending_quiz = []
    state.pending_checklist_concepts = []
    state.stage = ConversationStage.ONBOARDING
    state.next_agent = AgentName.PROFILER
    state.awaiting_input = False
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
    _extract_knowledge_best_effort(state, text, source="resume")
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
    _unlock_next_in_sequence(state, LLMClient())

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


class AddNodeRequest(BaseModel):
    session_id: str
    topic: str
    key_concepts: list[str] = []


@app.post("/roadmap/node/add")
def add_roadmap_node(payload: AddNodeRequest):
    """Learner-added custom topic. Defaults to PATH_B_OPEN_WEB - no dataset
    match needed, content fills in lazily via run_path_b the same as any
    other web node. Always appended at the end, LOCKED - it'll only unlock
    once every existing node ahead of it is complete, same sequential model
    as everything else (_unlock_next_in_sequence)."""
    state = _load_or_404(payload.session_id)
    if not payload.topic.strip():
        raise HTTPException(status_code=400, detail="Topic name is required")
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")

    base_id = slugify(payload.topic)
    node_id = base_id
    existing_ids = {n.node_id for n in state.roadmap.nodes}
    suffix = 2
    while node_id in existing_ids:
        node_id = f"{base_id}-{suffix}"
        suffix += 1

    state.roadmap.nodes.append(
        RoadmapNode(
            node_id=node_id,
            topic=payload.topic.strip(),
            path_type=PathType.PATH_B_OPEN_WEB,
            key_concepts=payload.key_concepts,
        )
    )
    db.save_state(state)
    return {"state": state}


class EditNodeRequest(BaseModel):
    session_id: str
    topic: str | None = None
    key_concepts: list[str] | None = None


@app.patch("/roadmap/node/{node_id}")
def edit_roadmap_node(node_id: str, payload: EditNodeRequest):
    """Restricted to LOCKED nodes, consistent with reorder/skip - never edit
    a topic the learner has already started or completed."""
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")
    node = state.roadmap.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"No node {node_id!r} in this roadmap")
    if node.status != NodeStatus.LOCKED:
        raise HTTPException(status_code=400, detail="Only upcoming (locked) topics can be edited")

    if payload.topic is not None and payload.topic.strip():
        node.topic = payload.topic.strip()
    if payload.key_concepts is not None:
        node.key_concepts = payload.key_concepts

    db.save_state(state)
    return {"state": state}


@app.post("/topic/{node_id}/project/expand")
def expand_project(node_id: str, payload: SessionIdRequest):
    """One extra LLM call, only on explicit request - see
    roadmap_generator.py's expand_project_description. Cached onto
    node.project.detailed_description so asking twice doesn't re-spend a
    call."""
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")
    node = state.roadmap.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"No node {node_id!r} in this roadmap")
    if node.project is None:
        raise HTTPException(status_code=400, detail=f"Node {node_id!r} has no project yet")

    detailed = expand_project_description(state, node, LLMClient())
    db.save_state(state)
    return {"detailed_description": detailed}


@app.post("/topic/{node_id}/regenerate")
def regenerate_topic(node_id: str, payload: SessionIdRequest):
    """Force-regenerates one module's project/quiz (and subtopics, if it
    already had any), picking up any profile/knowledge-base changes made
    since it was first generated. Refused for COMPLETE nodes - never
    rewrite a module the learner has already been graded on."""
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")
    node = state.roadmap.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"No node {node_id!r} in this roadmap")
    if node.status == NodeStatus.COMPLETE:
        raise HTTPException(status_code=400, detail="Can't regenerate a completed topic")

    regenerate_node_content(state, node, LLMClient())
    db.save_state(state)
    return {"state": state}


@app.post("/roadmap/regenerate")
def regenerate_roadmap(payload: SessionIdRequest):
    """Same as /topic/{id}/regenerate, applied to every not-yet-completed
    node in the roadmap."""
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")

    client = LLMClient()
    for node in state.roadmap.nodes:
        if node.status != NodeStatus.COMPLETE:
            regenerate_node_content(state, node, client)

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


@app.post("/topic/{node_id}/refresh-web")
def refresh_web_resources(node_id: str, payload: SessionIdRequest):
    """'Find more resources' - works on any node, dataset-grounded or
    web-sourced. Only adds/refreshes web_sources/youtube_links/
    cheat_sheet_notes; never touches an already-filled node's project or
    quiz - see path_b.py's module docstring."""
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")
    if state.roadmap.get_node(node_id) is None:
        raise HTTPException(status_code=404, detail=f"No node {node_id!r} in this roadmap")

    try:
        state = run_path_b(state, node_id=node_id)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Couldn't find more resources right now - please try again.",
        ) from exc

    db.save_state(state)
    return {"state": state}


class AssessmentSubmitRequest(BaseModel):
    session_id: str
    answers: list[str]  # one selected option string per question, in order


def _unlock_next_in_sequence(state: AppState, llm_client: LLMClient | None = None) -> None:
    """Exactly one node AVAILABLE at a time, in roadmap order (already
    topologically sorted by Path-A) - not "everything whose prerequisites
    are met," per the user's explicit "complete everything one by one"
    request. A PATH_B_OPEN_WEB node without an assessment yet is skipped -
    an unfilled stub (roadmap_generator.py normally fills every stub with
    real content via Path-B before ROADMAP_REVIEW, but never unlock one
    that isn't actually completable). PATH_A_DATASET nodes are always
    treated as unlockable regardless of assessment presence - several
    tests build lightweight dataset-node fixtures without one, matching
    how the rest of the app already assumes a dataset node is completable
    once Roadmap Generator has run.

    Also generates the node's subtopic breakdown right before it goes
    LOCKED -> AVAILABLE - lazily, one module at a time, per the user's
    "don't spend LLM calls on modules the learner hasn't reached yet"
    request (see roadmap_generator.py's ensure_subtopics)."""
    for node in state.roadmap.nodes:
        if node.status == NodeStatus.COMPLETE:
            continue
        if node.path_type == PathType.PATH_B_OPEN_WEB and node.assessment is None:
            continue
        if node.status == NodeStatus.LOCKED:
            ensure_subtopics(state, node, llm_client)
            node.status = NodeStatus.AVAILABLE
        break  # first non-complete, completable node found, unlocked or not - stop


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
    score, results = grade_mcq_batch(questions, payload.answers)
    passed = score >= node.assessment.pass_threshold

    node.assessment.last_score = score
    node.assessment.attempts += 1

    if passed:
        node.status = NodeStatus.COMPLETE
        node.completed_at = datetime.now(timezone.utc)
        _unlock_next_in_sequence(state, LLMClient())

    state.log(
        AgentName.ASSESSMENT,
        "topic_assessment_submitted",
        detail=f"{node_id}: {score:.2f} ({'pass' if passed else 'fail'})",
    )
    db.save_state(state)
    return {"score": score, "passed": passed, "node_status": node.status, "results": results}


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


class TopicNotesRequest(BaseModel):
    session_id: str
    notes: str


@app.patch("/topic/{node_id}/notes")
def update_topic_notes(node_id: str, payload: TopicNotesRequest):
    """The learner's own free-text notes on a topic - never surfaced
    anywhere else, purely their own reference."""
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")
    node = state.roadmap.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"No node {node_id!r} in this roadmap")

    node.notes = payload.notes
    db.save_state(state)
    return {"notes": node.notes}


class SubtopicToggleRequest(BaseModel):
    session_id: str
    checked: bool


@app.patch("/topic/{node_id}/subtopic/{subtopic_id}")
def toggle_subtopic(node_id: str, subtopic_id: str, payload: SubtopicToggleRequest):
    """Informational progress tracker only - never affects NodeStatus/
    completion, which stays gated by the quiz (submit_assessment)."""
    state = _load_or_404(payload.session_id)
    if state.roadmap is None:
        raise HTTPException(status_code=400, detail="No roadmap for this session")
    node = state.roadmap.get_node(node_id)
    if node is None:
        raise HTTPException(status_code=404, detail=f"No node {node_id!r} in this roadmap")
    subtopic = next((s for s in node.subtopics if s.subtopic_id == subtopic_id), None)
    if subtopic is None:
        raise HTTPException(status_code=404, detail=f"No subtopic {subtopic_id!r} on that node")

    subtopic.checked = payload.checked
    db.save_state(state)
    return {"state": state}


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
