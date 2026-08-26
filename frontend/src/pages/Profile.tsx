import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  deleteKnowledgeEntry,
  getKnowledge,
  getState,
  resumeFileUrl,
  restartGoal,
  updateProfile,
  uploadResume,
} from "../api";
import BuildingIndicator from "../components/BuildingIndicator";
import NavBar from "../components/NavBar";
import PageSkeleton from "../components/Skeleton";
import { getSessionId } from "../session";
import type { AppState, KnowledgeEntry, OccupationStatus } from "../types";

const CATEGORY_LABEL: Record<string, string> = {
  goal: "Goals",
  skill: "Skills",
  interest: "Interests",
  learning_style: "Learning Style",
  constraint: "Constraints",
  personality: "Personality",
  other: "Other",
};

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
  const [hobbies, setHobbies] = useState("");
  const [certifications, setCertifications] = useState("");
  const [extraInfo, setExtraInfo] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [resumeSaved, setResumeSaved] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [extractionWarning, setExtractionWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [restarting, setRestarting] = useState(false);

  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);

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
      setHobbies(toCommaList(p.hobbies));
      setCertifications(toCommaList(p.certifications));
      setExtraInfo(p.extra_info ?? "");
    });
    getKnowledge(sessionId)
      .then(({ entries }) => setKnowledge(entries))
      .catch(() => setKnowledge([]));
  }, [sessionId, navigate]);

  async function handleDeleteKnowledge(entryId: string) {
    if (!sessionId) return;
    setKnowledge((prev) => prev.filter((e) => e.id !== entryId));
    try {
      await deleteKnowledgeEntry(sessionId, entryId);
    } catch {
      // Best-effort - re-fetch to recover from a failed delete rather than
      // leaving the UI silently out of sync with the database.
      getKnowledge(sessionId)
        .then(({ entries }) => setKnowledge(entries))
        .catch(() => {});
    }
  }

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
        hobbies: fromCommaList(hobbies),
        certifications: fromCommaList(certifications),
        extra_info: extraInfo,
      });
      setState(state);
      setSaved(true);
      if (continueAfter) {
        // New users see the "import context" step once, right after the
        // required-fields gate, before landing in chat.
        navigate("/import?onboarding=1");
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
    setExtractionWarning(null);
    try {
      const result = await uploadResume(sessionId, file);
      const newState = result.state;
      console.log("[resume upload] response:", result);
      console.log("[resume upload] extracted profile:", newState.learner_profile);
      setState(newState);
      // Auto-fill the form from whatever the resume extraction newly
      // populated - fills blanks only, so anything already typed in stays.
      const p = newState.learner_profile;
      console.log("[resume merge] name:", p.name, "email:", p.email, "skills:", p.stated_known_skills);
      setName((prev) => prev || p.name || "");
      setEmail((prev) => prev || p.email || "");
      setAge((prev) => prev || (p.age ? String(p.age) : ""));
      setGender((prev) => prev || p.gender || "");
      setOccupation((prev) => prev || p.occupation_status || "");
      setProfessionalRole((prev) => prev || p.professional_role || "");
      setGoal((prev) => prev || p.goal || "");
      setInterests(toCommaList(p.interests));
      setKnownSkills(toCommaList(p.stated_known_skills));
      setPriorHistory(toCommaList(p.prior_learning_history));
      setHobbies(toCommaList(p.hobbies));
      setCertifications(toCommaList(p.certifications));
      setExtraInfo((prev) => prev || p.extra_info || "");
      setResumeSaved(true);
      if (result.extraction_warning) {
        setExtractionWarning(result.extraction_warning);
      }
    } catch {
      setResumeError("Couldn't read that PDF - try a different file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleStartNewGoal() {
    if (!sessionId || restarting) return;
    const confirmed = window.confirm(
      "Start a new goal? This clears your current roadmap and skill assessment - your name/email/" +
        "age/gender/occupation stay the same. This can't be undone.",
    );
    if (!confirmed) return;
    setRestarting(true);
    try {
      await restartGoal(sessionId);
      navigate("/chat");
    } catch {
      setRestarting(false);
    }
  }

  if (!sessionId || !state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <NavBar />
        <PageSkeleton />
      </div>
    );
  }

  const assessments = state.skill_gap_map.assessments;

  const resumeSection = (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-300">Resume</h2>
      <p className="mb-3 text-xs text-slate-500">
        {isRequired
          ? "Upload a PDF and we'll auto-fill as much of the form below as we can find - " +
            "name, age, gender, skills, certifications, hobbies, and more. Anything it can't " +
            "find, just fill in yourself."
          : "PDF only. We'll pull skills, certifications, hobbies, and other details out to " +
            "auto-fill your profile below, and use it to personalize your roadmap and chats."}
      </p>
      {state.learner_profile.resume_filename && (
        <div className="mb-3 flex items-center justify-between rounded-md bg-slate-950 px-3 py-2 text-xs">
          <span className="truncate text-slate-300">
            📄 {state.learner_profile.resume_filename}
            {state.learner_profile.resume_uploaded_at && (
              <span className="text-slate-500">
                {" "}
                · uploaded {new Date(state.learner_profile.resume_uploaded_at).toLocaleDateString()}
              </span>
            )}
          </span>
          <a
            href={resumeFileUrl(sessionId)}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-indigo-400 hover:underline"
          >
            View PDF
          </a>
        </div>
      )}
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
        {uploading
          ? "Reading resume..."
          : state.learner_profile.resume_filename
            ? "Upload a new PDF"
            : "Choose PDF"}
      </button>
      {uploading && (
        <BuildingIndicator label="Reading your resume and building your profile..." className="mt-3" />
      )}
      {resumeSaved && !uploading && !extractionWarning && (
        <p className="mt-2 text-sm text-green-400">Resume read successfully - fields below were auto-filled.</p>
      )}
      {extractionWarning && !uploading && (
        <p className="mt-2 text-sm text-yellow-400">{extractionWarning}</p>
      )}
      {resumeError && <p className="mt-2 text-sm text-red-400">{resumeError}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar hasRoadmap={!!state.roadmap} />
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-bold">Your Profile</h1>
          <p className="mt-2 text-sm text-slate-400">
            This is what we've gathered about you so far. Fix anything that's wrong - it
            shapes your roadmap.
          </p>
          {isRequired && (
            <div className="mt-3 rounded-lg border border-indigo-800 bg-indigo-950/40 px-4 py-3 text-sm text-indigo-200">
              Welcome! Fill in a few required details before we get started - or upload your
              resume below and we'll fill in what we can for you.
            </div>
          )}
        </div>

        {isRequired && resumeSection}

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
          <Field label="Hobbies (comma-separated)">
            <input value={hobbies} onChange={(e) => setHobbies(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Certifications (comma-separated)">
            <input
              value={certifications}
              onChange={(e) => setCertifications(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-sm font-semibold text-slate-300">Extra Information</h2>
          <p className="text-xs text-slate-500">
            Anything else worth knowing that doesn't fit the fields above - awards,
            publications, languages, volunteer work, open-source contributions, etc. Pulled
            automatically from your resume where possible; edit freely. This feeds into how
            your roadmap and chats are personalized, same as everything else here.
          </p>
          <textarea
            value={extraInfo}
            onChange={(e) => setExtraInfo(e.target.value)}
            rows={4}
            placeholder="e.g. Fluent in Spanish, published two open-source npm packages, volunteer coding tutor on weekends..."
            className="w-full resize-y rounded-md bg-slate-950 p-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
          />
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
            {knowledge.length > 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-1 text-sm font-semibold text-slate-300">Key Points</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Extracted from what you've imported or uploaded. Remove anything that's
                  wrong - it feeds directly into how your roadmap is shaped.
                </p>
                <div className="space-y-3">
                  {Object.entries(
                    knowledge.reduce<Record<string, KnowledgeEntry[]>>((acc, entry) => {
                      (acc[entry.category] ??= []).push(entry);
                      return acc;
                    }, {}),
                  ).map(([category, entries]) => (
                    <div key={category}>
                      <h3 className="mb-1 text-xs font-medium text-slate-400">
                        {CATEGORY_LABEL[category] ?? category}
                      </h3>
                      <ul className="space-y-1">
                        {entries.map((entry) => (
                          <li
                            key={entry.id}
                            className="flex items-start justify-between gap-3 text-sm text-slate-200"
                          >
                            <span>{entry.content}</span>
                            <button
                              onClick={() => handleDeleteKnowledge(entry.id)}
                              className="shrink-0 text-xs text-slate-500 hover:text-red-400"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resumeSection}

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

            {state.roadmap && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/10 p-4">
                <h2 className="mb-2 text-sm font-semibold text-slate-300">Start a New Goal</h2>
                <p className="mb-3 text-xs text-slate-500">
                  Ready to learn something else? This clears your current roadmap and skill
                  assessment - your personal details stay the same.
                </p>
                <button
                  onClick={handleStartNewGoal}
                  disabled={restarting}
                  className="rounded-md bg-red-950 px-3 py-1 text-xs font-medium text-red-300 transition hover:bg-red-900 disabled:opacity-50"
                >
                  {restarting ? "Starting..." : "Start a new goal"}
                </button>
              </div>
            )}

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
