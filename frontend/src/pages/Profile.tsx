import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getState, updateProfile } from "../api";
import NavBar from "../components/NavBar";
import { getSessionId } from "../session";
import type { AppState } from "../types";

const STATUS_COLOR: Record<string, string> = {
  known: "text-green-400",
  learned: "text-green-400",
  claimed_unconfirmed: "text-yellow-400",
  gap: "text-red-400",
};

function toCommaList(items: string[]): string {
  return items.join(", ");
}

function fromCommaList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function Profile() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [state, setState] = useState<AppState | null>(null);

  const [goal, setGoal] = useState("");
  const [timeline, setTimeline] = useState("");
  const [interests, setInterests] = useState("");
  const [knownSkills, setKnownSkills] = useState("");
  const [priorHistory, setPriorHistory] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => {
      setState(state);
      setGoal(state.learner_profile.goal ?? "");
      setTimeline(state.learner_profile.timeline ?? "");
      setInterests(toCommaList(state.learner_profile.interests));
      setKnownSkills(toCommaList(state.learner_profile.stated_known_skills));
      setPriorHistory(toCommaList(state.learner_profile.prior_learning_history));
    });
  }, [sessionId, navigate]);

  async function handleSave() {
    if (!sessionId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { state } = await updateProfile(sessionId, {
        goal,
        timeline,
        interests: fromCommaList(interests),
        stated_known_skills: fromCommaList(knownSkills),
        prior_learning_history: fromCommaList(priorHistory),
      });
      setState(state);
      setSaved(true);
    } catch {
      setError("Couldn't save your profile - try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!sessionId || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading your profile...
      </div>
    );
  }

  const assessments = state.skill_gap_map.assessments;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-bold">Your Profile</h1>
        <p className="mt-2 text-sm text-slate-400">
          This is what we've gathered about you so far. Fix anything that's wrong - it
          shapes your roadmap.
        </p>

        <div className="mt-6 space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Goal</label>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full rounded-md bg-slate-950 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Timeline</label>
            <input
              value={timeline}
              onChange={(e) => setTimeline(e.target.value)}
              className="w-full rounded-md bg-slate-950 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Interests (comma-separated)
            </label>
            <input
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              className="w-full rounded-md bg-slate-950 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Known skills (comma-separated)
            </label>
            <input
              value={knownSkills}
              onChange={(e) => setKnownSkills(e.target.value)}
              className="w-full rounded-md bg-slate-950 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">
              Prior learning history (comma-separated)
            </label>
            <input
              value={priorHistory}
              onChange={(e) => setPriorHistory(e.target.value)}
              className="w-full rounded-md bg-slate-950 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <p className="text-sm text-green-400">Saved.</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">
            Skill Assessment Results
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Read-only - these come from your quiz results, not self-reported.
          </p>
          {assessments.length === 0 ? (
            <p className="text-sm text-slate-500">No skills assessed yet.</p>
          ) : (
            <ul className="space-y-1">
              {assessments.map((a) => (
                <li key={a.concept} className="flex items-center justify-between text-sm">
                  <span>{a.concept}</span>
                  <span className={`text-xs font-medium ${STATUS_COLOR[a.status]}`}>
                    {a.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
