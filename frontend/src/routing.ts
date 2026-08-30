import type { ConversationStage } from "./types";

// All authenticated stages go to /app, where StageRouter dynamically
// renders the correct page based on state.stage.
export function routeForStage(_stage: ConversationStage): string {
  return "/app";
}
