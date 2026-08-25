import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getState, updateProfile, uploadResume } from "../api";
import NavBar from "../components/NavBar";
import { getSessionId } from "../session";
import type { AppState, OccupationStatus } from "../types";

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-300">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-md bg-slate-950 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500";

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isRequired = searchParams.get("required") === "1";
  const sessionId = getSessionId();
  const [state, setState] = useState<AppState | null>(null);

  // Personal details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [occupation, setOccupation] = useState<OccupationStatus | "">("");
  const [studentPercentage, setStudentPercentage] = useState("");
  const [professionalRole, setProfessionalRole] = useState("");

  // Learning profile
  const [goal, setGoal] = useState("");
  const [timeline, setTimeline] = useState("");
  const [interests, setInterests] = useState("");
  const [knownSkills, setKnownSkills] = useState("");
  const [priorHistory, setPriorHistory] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [resumeSaved, setResumeSaved] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => {
      setState(state);
      const p = state.learner_profile;
      setName(p.name ?? "");
      setEmail(p.email ?? "");
      setAge(p.age ? String(p.age) : "");
      setGender(p.gender ?? "");
      setOccupation(p.occupation_status ?? "");
      setStudentPercentage(p.student_percentage ?? "");
      setProfessionalRole(p.professional_role ?? "");
      setGoal(p.goal ?? "");
      setTimeline(p.timeline ?? "");
      setInterests(toCommaList(p.interests));
      setKnownSkills(toCommaList(p.stated_known_skills));
      setPriorHistory(toCommaList(p.prior_learning_history));
    });
  }, [sessionId, navigate]);

  const requiredFieldsFilled = !!(name.trim() && email.trim() && age.trim() && gender.trim() && occupation);

  async function handleSave(continueAfter: boolean) {
    if (!sessionId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { state } = await updateProfile(sessionId, {
        name,
        email,
        age: age ? Number(age) : undefined,
        gender,
        occupation_status: occupation || undefined,
        student_percentage: studentPercentage,
        professional_role: professionalRole,
        goal,
        timeline,
        interests: fromCommaList(interests),
        stated_known_skills: fromCommaList(knownSkills),
        prior_learning_history: fromCommaList(priorHistory),
      });
      setState(state);
      setSaved(true);
      if (continueAfter) {
        navigate("/chat");
      }
    } catch {
      setError("Couldn't save your profile - try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!sessionId || !file) return;
    setUploading(true);
    setResumeError(null);
    setResumeSaved(false);
    try {
      await uploadResume(sessionId, file);
      setResumeSaved(true);
    } catch {
      setResumeError("Couldn't read that PDF - try a different file.");
    } finally {
      setUploading(false);
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
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-bold">Your Profile</h1>
          <p className="mt-2 text-sm text-slate-400">
            This is what we've gathered about you so far. Fix anything that's wrong - it
            shapes your roadmap.
          </p>
          {isRequired && (
            <div className="mt-3 rounded-lg border border-indigo-800 bg-indigo-950/40 px-4 py-3 text-sm text-indigo-200">
              Welcome! Fill in a few required details before we get started.
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-300">Personal Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Email *">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className={inputClass}
              />
            </Field>
            <Field label="Age *">
              <input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                type="number"
                min={1}
                className={inputClass}
              />
            </Field>
            <Field label="Gender *">
              <input value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Currently *">
              <select
                value={occupation}
                onChange={(e) => setOccupation(e.target.value as OccupationStatus)}
                className={inputClass}
              >
                <option value="">Select...</option>
                <option value="student">Student</option>
                <option value="working_professional">Working Professional</option>
              </select>
            </Field>
            {occupation === "student" && (
              <Field label="Percentage / marks (optional)">
                <input
                  value={studentPercentage}
                  onChange={(e) => setStudentPercentage(e.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
            {occupation === "working_professional" && (
              <Field label="Current role (optional)">
                <input
                  value={professionalRole}
                  onChange={(e) => setProfessionalRole(e.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-300">Learning Profile</h2>
          <Field label="Goal">
            <input value={goal} onChange={(e) => setGoal(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Timeline">
            <input value={timeline} onChange={(e) => setTimeline(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Interests (comma-separated)">
            <input value={interests} onChange={(e) => setInterests(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Known skills (comma-separated)">
            <input
              value={knownSkills}
              onChange={(e) => setKnownSkills(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Prior learning history (comma-separated)">
            <input
              value={priorHistory}
              onChange={(e) => setPriorHistory(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {isRequired ? (
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !requiredFieldsFilled}
            className="w-full rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Continue to Chat"}
          </button>
        ) : (
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        {saved && !isRequired && <p className="text-sm text-green-400">Saved.</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {!isRequired && (
          <>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300">Resume</h2>
              <p className="mb-3 text-xs text-slate-500">
                PDF only. We'll pull the text out and use it as a hint when shaping your
                roadmap.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileSelected}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-md bg-slate-700 px-3 py-1 text-xs font-medium transition hover:bg-slate-600 disabled:opacity-50"
              >
                {uploading ? "Reading resume..." : "Choose PDF"}
              </button>
              {resumeSaved && <p className="mt-2 text-sm text-green-400">Resume read successfully.</p>}
              {resumeError && <p className="mt-2 text-sm text-red-400">{resumeError}</p>}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300">Import from another AI</h2>
              <p className="mb-3 text-xs text-slate-500">
                Already talked to an AI about your goals elsewhere? Bring that context in.
              </p>
              <Link
                to="/import"
                className="inline-block rounded-md bg-slate-700 px-3 py-1 text-xs font-medium transition hover:bg-slate-600"
              >
                Import AI Context
              </Link>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
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
          </>
        )}
      </div>
    </div>
  );
}
