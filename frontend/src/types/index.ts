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

export type NodeStatus = "locked" | "available" | "in_progress" | "complete" | "skipped";

export type AgentName =
  | "orchestrator"
  | "profiler"
  | "assessment"
  | "path_a"
  | "path_b"
  | "roadmap_generator"
  | "project_generator"
  | "explainer"
  | "tutor"
  | "done";

export type OccupationStatus = "student" | "working_professional";

export interface LearnerProfile {
  name: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  occupation_status: OccupationStatus | null;
  student_percentage: string | null;
  professional_role: string | null;
  goal: string | null;
  timeline: string | null;
  interests: string[];
  stated_known_skills: string[];
  prior_learning_history: string[];
  imported_context_raw: string | null;
  resume_raw: string | null;
  resume_filename: string | null;
  resume_uploaded_at: string | null;
  hobbies: string[];
  certifications: string[];
  extra_info: string | null;
  roadmap_instructions: string | null;
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
  success_criteria: string[];
  detailed_description: string | null;
}

export interface MCQQuestion {
  question: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
}

export interface QuestionResult {
  question: string;
  your_answer: string;
  correct_answer: string;
  correct: boolean;
  explanation: string;
}

export interface TopicAssessment {
  questions: MCQQuestion[];
  pass_threshold: number;
  last_score: number | null;
  attempts: number;
}

export type SubtopicStatus = "locked" | "available" | "passed" | "skipped";

export interface WebResource {
  title: string;
  url: string;
  snippet: string;
  source_type?: string;
  score?: number | null;
  published_date?: string | null;
  reason?: string | null;
}

export interface Subtopic {
  subtopic_id: string;
  name: string;
  status: SubtopicStatus;
  quiz: TopicAssessment | null;
}

export interface RoadmapNode {
  node_id: string;
  topic: string;
  path_type: PathType;
  status: NodeStatus;
  course_name: string | null;
  course_search_link: string | null;
  course_summary: string | null;
  youtube_links: WebResource[];
  cheat_sheet_notes: string | null;
  web_sources: WebResource[];
  internal_prerequisites: string[];
  external_prerequisite_concepts: string[];
  project: ProjectAssignment | null;
  assessment: TopicAssessment | null;
  completed_at: string | null;
  time_spent_seconds: number;
  key_concepts: string[];
  estimated_days: number;
  notes: string;
  subtopics: Subtopic[];
  next_review_at: string | null;
  review_count: number;
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
  agent: AgentName | null;
}

export interface AppState {
  session_id: string;
  user_id: string | null;
  stage: ConversationStage;
  learner_profile: LearnerProfile;
  skill_gap_map: SkillGapMap;
  roadmap: Roadmap | null;
  conversation_history: ChatTurn[];
  progress_log: ProgressEvent[];
  next_agent: AgentName;
  last_user_message: string | null;
  pending_quiz: MCQQuestion[];
  pending_checklist_concepts: string[];
  current_streak_days: number;
  longest_streak_days: number;
  last_active_date: string | null;
}

// Not part of AppState - a separate per-user table (backend/common/db.py's
// user_knowledge), fetched via GET /knowledge/{session_id}.
export interface KnowledgeEntry {
  id: string;
  category: string;
  content: string;
  source: string;
  created_at: string;
}

export interface Badge {
  id: string;
  label: string;
  icon: string;
  achieved: boolean;
}

export interface DashboardResponse {
  percent_complete: number;
  skill_radar: Record<string, ConceptStatus>;
  current_node: RoadmapNode | null;
  next_recommended_action: string;
  current_streak_days: number;
  longest_streak_days: number;
  badges: Badge[];
}

export interface DueReview {
  node_id: string;
  topic: string;
}

export interface PerTopicTime {
  topic: string;
  seconds: number;
}

export interface SkillSummary {
  known: number;
  learned: number;
  claimed_unconfirmed: number;
  gap: number;
}

export interface AnalyticsResponse {
  quiz_pass_rate: number;
  topics_completed_this_week: number;
  total_time_spent_seconds: number;
  topics_total: number;
  topics_completed: number;
  average_score: number;
  per_topic_time: PerTopicTime[];
  skill_summary: SkillSummary;
}

export interface ApiErrorResponse {
  detail: string;
}

