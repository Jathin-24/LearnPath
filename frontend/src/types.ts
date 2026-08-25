// Mirrors backend/orchestrator/state_schema.py exactly - keep in sync by hand,
// this is the canonical shape the backend actually serializes.

export type ConversationStage =
  | "onboarding"
  | "assessment"
  | "path_selection"
  | "roadmap_generation"
  | "roadmap_review"
  | "in_progress"
  | "topic_assessment"
  | "complete";

export type ConceptStatus = "known" | "claimed_unconfirmed" | "gap" | "learned";

export type PathType = "path_a_dataset" | "path_b_open_web" | "mixed";

export type NodeStatus = "locked" | "available" | "in_progress" | "complete";

export type AgentName =
  | "orchestrator"
  | "profiler"
  | "assessment"
  | "path_a"
  | "path_b"
  | "roadmap_generator"
  | "project_generator"
  | "explainer"
  | "done";

export interface LearnerProfile {
  goal: string | null;
  timeline: string | null;
  interests: string[];
  stated_known_skills: string[];
  prior_learning_history: string[];
  imported_context_raw: string | null;
  resume_raw: string | null;
}

export interface ConceptAssessment {
  concept: string;
  status: ConceptStatus;
  quiz_score: number | null;
  source_course: string | null;
}

export interface SkillGapMap {
  assessments: ConceptAssessment[];
}

export interface ProjectAssignment {
  title: string;
  description: string;
}

export interface MCQQuestion {
  question: string;
  options: string[];
  correct_option_index: number;
}

export interface TopicAssessment {
  questions: MCQQuestion[];
  pass_threshold: number;
  last_score: number | null;
  attempts: number;
}

export interface RoadmapNode {
  node_id: string;
  topic: string;
  path_type: PathType;
  status: NodeStatus;
  course_name: string | null;
  course_search_link: string | null;
  course_summary: string | null;
  youtube_links: string[];
  cheat_sheet_notes: string | null;
  web_sources: string[];
  internal_prerequisites: string[];
  external_prerequisite_concepts: string[];
  project: ProjectAssignment | null;
  assessment: TopicAssessment | null;
  completed_at: string | null;
  time_spent_seconds: number;
}

export interface Roadmap {
  path_type: PathType;
  nodes: RoadmapNode[];
  current_node_id: string | null;
}

export interface ProgressEvent {
  timestamp: string;
  agent: AgentName;
  event_type: string;
  detail: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface AppState {
  session_id: string;
  stage: ConversationStage;
  learner_profile: LearnerProfile;
  skill_gap_map: SkillGapMap;
  roadmap: Roadmap | null;
  conversation_history: ChatTurn[];
  progress_log: ProgressEvent[];
  next_agent: AgentName;
  last_user_message: string | null;
  pending_quiz: MCQQuestion[];
}

export interface DashboardResponse {
  percent_complete: number;
  skill_radar: Record<string, ConceptStatus>;
  current_node: RoadmapNode | null;
  next_recommended_action: string;
}

export interface AnalyticsResponse {
  quiz_pass_rate: number;
  topics_completed_this_week: number;
  total_time_spent_seconds: number;
}
