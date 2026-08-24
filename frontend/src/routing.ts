import type { ConversationStage } from "./types";

// Where a resumed/redirected session should land based on its current stage.
export function routeForStage(stage: ConversationStage): string {
  switch (stage) {
    case "onboarding":
    case "assessment":
    case "path_selection":
    case "roadmap_generation":
      return "/chat";
    case "roadmap_review":
      return "/roadmap";
    case "in_progress":
    case "topic_assessment":
      return "/dashboard";
    case "complete":
      return "/complete";
    default:
      return "/chat";
  }
}
