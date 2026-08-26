import type { ProjectAssignment, RoadmapNode } from "./types";

// Mostly-fixed template, only a handful of words substituted per subtopic -
// meant to be pasted into an external LLM (ChatGPT etc.) to go deep on one
// sub-concept, with enough context that the reply is actually useful:
// what course/path it's part of, the learner's overall goal, and the
// checkpoint project it should tie back to.
export function buildTopicPrompt(
  node: RoadmapNode,
  subtopicName: string,
  goal: string | null,
  project: ProjectAssignment | null,
): string {
  const goalClause = goal ? ` as part of my learning path toward: ${goal}` : "";
  const projectClause = project
    ? `\n\nFor context, my checkpoint project for this topic is "${project.title}": ${project.description}\n`
    : "";

  return `I'm learning "${node.topic}"${goalClause}. Right now I'm focusing on the sub-concept: \
"${subtopicName}".${projectClause}
Please teach me "${subtopicName}" in depth:
1. Explain the core concept clearly, as if I'm learning it for the first time.
2. Walk through common edge cases and mistakes people run into with this.
3. Give me a small, practical example I can try myself.
4. If relevant, relate it back to the project above so I can see how it fits into what I'm building.

Keep it practical and example-driven.`;
}
