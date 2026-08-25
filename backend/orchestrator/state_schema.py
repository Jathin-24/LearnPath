"""
state_schema.py

The single shared state object that flows through the LangGraph orchestrator.
Every agent reads from and writes to THIS schema — no agent should invent its
own ad-hoc state shape. This is the contract that makes multi-agent
coordination debuggable instead of spaghetti.

Design notes:
- Enums are used wherever a field has a fixed set of valid values, so bad
  agent output fails validation immediately instead of propagating silently.
- Nothing here calls an LLM or does I/O. Pure data.
- `AppState` is what gets passed into and returned from every LangGraph node.
- `next_agent` is the orchestrator's routing field: each agent (or the
  orchestrator itself) sets it to tell LangGraph which node runs next.
"""

from datetime import datetime
from enum import Enum
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ConversationStage(str, Enum):
    ONBOARDING = "onboarding"
    ASSESSMENT = "assessment"
    PATH_SELECTION = "path_selection"
    ROADMAP_GENERATION = "roadmap_generation"
    ROADMAP_REVIEW = "roadmap_review"
    IN_PROGRESS = "in_progress"          # working through roadmap topics
    TOPIC_ASSESSMENT = "topic_assessment"
    COMPLETE = "complete"


class ConceptStatus(str, Enum):
    KNOWN = "known"                       # user claimed + quiz confirmed
    CLAIMED_UNCONFIRMED = "claimed_unconfirmed"  # user ticked it, quiz not yet taken
    GAP = "gap"                           # user doesn't know it
    LEARNED = "learned"                   # gap that's since been closed via roadmap


class PathType(str, Enum):
    PATH_A_DATASET = "path_a_dataset"
    PATH_B_OPEN_WEB = "path_b_open_web"
    MIXED = "mixed"


class NodeStatus(str, Enum):
    LOCKED = "locked"           # prerequisites not yet met
    AVAILABLE = "available"     # unlocked, not started
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"


class AgentName(str, Enum):
    ORCHESTRATOR = "orchestrator"
    PROFILER = "profiler"
    ASSESSMENT = "assessment"
    PATH_A = "path_a"
    PATH_B = "path_b"
    ROADMAP_GENERATOR = "roadmap_generator"
    PROJECT_GENERATOR = "project_generator"
    EXPLAINER = "explainer"
    DONE = "done"                # sentinel: graph should terminate this turn


# ---------------------------------------------------------------------------
# Learner profile (written by Profiler Agent)
# ---------------------------------------------------------------------------

class LearnerProfile(BaseModel):
    # Identity fields - required by the frontend's post-signup completion
    # gate (see frontend/src/pages/Profile.tsx), optional here at the schema
    # level so existing sessions predating this field don't break.
    name: Optional[str] = None
    email: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None                    # free text, not a fixed set of options
    occupation_status: Optional[Literal["student", "working_professional"]] = None
    student_percentage: Optional[str] = None        # free text - "85%", "3.8 GPA", etc.
    professional_role: Optional[str] = None          # e.g. "Backend Developer"

    goal: Optional[str] = None                     # e.g. "become a backend developer"
    timeline: Optional[str] = None                  # e.g. "3 months"
    interests: list[str] = Field(default_factory=list)
    stated_known_skills: list[str] = Field(default_factory=list)  # self-reported, pre-assessment
    prior_learning_history: list[str] = Field(default_factory=list)
    # Optional: raw text the user pastes back after running our export prompt
    # in another AI tool (see prompts/context_export_prompt.txt). Profiler
    # Agent parses this once, on submission, to enrich the fields above -
    # it is never sent back out anywhere and is not treated as ground truth
    # on its own (still merged with what the user tells us directly).
    imported_context_raw: Optional[str] = None
    # Optional: extracted text from an uploaded resume (PDF only - see
    # backend/api/main.py's /profile/resume route). Same treatment as
    # imported_context_raw: a hint merged into Profiler's extraction prompt,
    # never treated as ground truth on its own.
    resume_raw: Optional[str] = None


# ---------------------------------------------------------------------------
# Skill assessment (written by Assessment Agent)
# ---------------------------------------------------------------------------

class ConceptAssessment(BaseModel):
    concept: str
    status: ConceptStatus
    quiz_score: Optional[float] = None   # 0.0-1.0, None if not yet quizzed
    source_course: Optional[str] = None  # which course's concept list this came from


class SkillGapMap(BaseModel):
    assessments: list[ConceptAssessment] = Field(default_factory=list)

    def gaps(self) -> list[str]:
        return [a.concept for a in self.assessments if a.status == ConceptStatus.GAP]

    def known(self) -> list[str]:
        return [a.concept for a in self.assessments if a.status == ConceptStatus.KNOWN]


# ---------------------------------------------------------------------------
# Roadmap (written by Path-A / Path-B agents, assembled by Roadmap Generator)
# ---------------------------------------------------------------------------

class ProjectAssignment(BaseModel):
    title: str
    description: str
    success_criteria: list[str] = Field(default_factory=list)  # "success looks like" checklist


class MCQQuestion(BaseModel):
    question: str
    options: list[str]                 # e.g. ["A. ...", "B. ...", "C. ...", "D. ..."]
    correct_option_index: int          # index into options
    explanation: str = ""              # one sentence on why the correct answer is correct -
                                        # generated alongside the question, shown on a wrong
                                        # answer instead of leaving the learner with just a score


class TopicAssessment(BaseModel):
    questions: list[MCQQuestion] = Field(default_factory=list)
    pass_threshold: float = 0.7
    last_score: Optional[float] = None
    attempts: int = 0


class RoadmapNode(BaseModel):
    node_id: str                                     # stable id, e.g. slugified topic name
    topic: str
    path_type: PathType
    status: NodeStatus = NodeStatus.LOCKED

    # Path A fields (populated when path_type == PATH_A_DATASET)
    course_name: Optional[str] = None
    course_search_link: Optional[str] = None
    course_summary: Optional[str] = None

    # Path B fields (populated when path_type == PATH_B_OPEN_WEB)
    youtube_links: list[str] = Field(default_factory=list)
    cheat_sheet_notes: Optional[str] = None
    web_sources: list[str] = Field(default_factory=list)

    # Shared across both paths
    internal_prerequisites: list[str] = Field(default_factory=list)   # node_ids
    external_prerequisite_concepts: list[str] = Field(default_factory=list)  # not in dataset, informational
    project: Optional[ProjectAssignment] = None
    assessment: Optional[TopicAssessment] = None

    # Analytics/Timer support (set when the node's assessment is passed /
    # while the learner has the Topic Detail page open - see
    # backend/api/main.py's /analytics and /topic/{id}/time routes)
    completed_at: Optional[datetime] = None
    time_spent_seconds: int = 0

    # Shown in the roadmap list view - see backend/agents/path_a.py
    # (key_concepts, from the dataset's own concept tags) and
    # backend/agents/roadmap_generator.py (estimated_days, from the same
    # per-node LLM call that already generates the project/quiz).
    key_concepts: list[str] = Field(default_factory=list)
    estimated_days: int = 0

    # The learner's own free-text notes on this topic - never shown or used
    # anywhere else, purely their own reference (active recall/journaling).
    # See backend/api/main.py's PATCH /topic/{node_id}/notes.
    notes: str = ""


class Roadmap(BaseModel):
    path_type: PathType
    nodes: list[RoadmapNode] = Field(default_factory=list)
    current_node_id: Optional[str] = None

    def get_node(self, node_id: str) -> Optional[RoadmapNode]:
        return next((n for n in self.nodes if n.node_id == node_id), None)

    def percent_complete(self) -> float:
        if not self.nodes:
            return 0.0
        done = sum(1 for n in self.nodes if n.status == NodeStatus.COMPLETE)
        return round(done / len(self.nodes) * 100, 1)


# ---------------------------------------------------------------------------
# Progress log (append-only audit trail — powers the dashboard + debugging)
# ---------------------------------------------------------------------------

class ProgressEvent(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    agent: AgentName
    event_type: str        # e.g. "node_completed", "quiz_failed", "profile_updated"
    detail: str = ""


# ---------------------------------------------------------------------------
# Top-level shared state — this is what LangGraph passes between nodes
# ---------------------------------------------------------------------------

class ChatTurn(BaseModel):
    role: str               # "user" | "assistant"
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class AppState(BaseModel):
    session_id: str
    stage: ConversationStage = ConversationStage.ONBOARDING

    learner_profile: LearnerProfile = Field(default_factory=LearnerProfile)
    skill_gap_map: SkillGapMap = Field(default_factory=SkillGapMap)
    roadmap: Optional[Roadmap] = None

    conversation_history: list[ChatTurn] = Field(default_factory=list)
    progress_log: list[ProgressEvent] = Field(default_factory=list)

    # Orchestrator routing: which agent should act next. Set by whichever
    # agent/orchestrator step just ran; read by the graph's conditional edge.
    next_agent: AgentName = AgentName.PROFILER

    # Scratch field for passing a single message between two adjacent agents
    # without polluting the rest of state (e.g. raw user input for this turn)
    last_user_message: Optional[str] = None

    # Scratch field for the Assessment Agent's initial skill-check quiz (the
    # concept-checklist -> adaptive MCQ phase, which happens before any
    # RoadmapNode/TopicAssessment exists to hold it). Holds the
    # LLM-generated questions + correct answers between the turn the quiz is
    # shown and the turn it's graded, so grading stays a deterministic index
    # comparison rather than an LLM re-judging correctness. Cleared once
    # graded; the durable result lives in skill_gap_map.assessments.
    pending_quiz: list[MCQQuestion] = Field(default_factory=list)

    # Scratch field for the Assessment Agent's checklist phase - candidate
    # concepts shown to the learner as a checkbox list (see
    # frontend/src/pages/Chat.tsx), confirmed via the dedicated
    # POST /assessment/checklist/submit route rather than free-text chat
    # parsing. Cleared once the learner confirms (or declines) their known
    # concepts and the quiz phase begins.
    pending_checklist_concepts: list[str] = Field(default_factory=list)

    # True when the CURRENTLY-active agent (next_agent) is mid-conversation,
    # waiting on the learner's next message, rather than ready to hand off to
    # a different agent. Needed because next_agent alone is ambiguous: it has
    # to mean both "who resumes on the next /chat call" (which must point at
    # the paused agent itself, e.g. ASSESSMENT) AND "should this graph
    # invocation stop now" - a node can't signal both with one enum value
    # without conflating "pause and resume here" with "terminate". The graph's
    # conditional entry point always trusts next_agent to pick where to
    # resume; the conditional edges check awaiting_input first and stop the
    # cascade (route to DONE/END) before ever consulting next_agent.
    awaiting_input: bool = False

    def log(self, agent: AgentName, event_type: str, detail: str = "") -> None:
        self.progress_log.append(
            ProgressEvent(agent=agent, event_type=event_type, detail=detail)
        )
