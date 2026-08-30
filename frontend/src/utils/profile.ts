import type { LearnerProfile } from "../types";

// The "required" onboarding fields. A user is not allowed into the app
// (dashboard, topic pages, analytics, chat, AI tutor) until these are set,
// mirroring the gating enforced on /profile?required=1.
export const REQUIRED_PROFILE_FIELDS: Array<keyof LearnerProfile> = [
  "name",
  "email",
  "age",
  "gender",
  "occupation_status",
];

export function learnerProfileComplete(profile: LearnerProfile | null): boolean {
  if (!profile) return false;
  const value = profile.occupation_status;
  return Boolean(
    profile.name?.trim() &&
      profile.email?.trim() &&
      profile.age != null &&
      profile.gender?.trim() &&
      (value === "student" || value === "working_professional"),
  );
}
