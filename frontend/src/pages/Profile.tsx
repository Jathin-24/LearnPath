import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { User, Target, Brain, Import, RotateCcw, Upload, FileText, CheckCircle, Lightbulb, PenTool, Trash2 } from "lucide-react";
import {
  deleteKnowledgeEntry,
  getKnowledge,
  getResumeFile,
  importContext,
  restartGoal,
  updateProfile,
  uploadResume,
} from "../api";
import BuildingIndicator from "../components/BuildingIndicator";
import PageSkeleton from "../components/Skeleton";
import { useAppState } from "../context/AppStateContext";
import { useToast } from "../context/ToastContext";
import type { KnowledgeEntry, OccupationStatus } from "../types";

const CATEGORY_LABEL: Record<string, string> = {
  goal: "Goals",
  skill: "Skills",
  interest: "Interests",
  learning_style: "Learning Style",
  constraint: "Constraints",
  personality: "Personality",
  other: "Other",
};

const SKILL_STATUS_COLOR: Record<string, string> = {
  known: "text-green-400",
  claimed_unconfirmed: "text-yellow-400",
  gap: "text-red-400",
  learned: "text-emerald-400",
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
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-400 tracking-wide">{label}</label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all placeholder:text-slate-500";

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isRequired = searchParams.get("required") === "1";
  const { state, updateState, auth } = useAppState();
  const { toast } = useToast();
  const sessionId = auth?.session_id;

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
  const [roadmapInstructions, setRoadmapInstructions] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [uploading, setUploading] = useState(false);
  const [resumeSaved, setResumeSaved] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importText, setImportText] = useState("");
  const [importingContext, setImportingContext] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  const [restarting, setRestarting] = useState(false);

  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);

  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    if (!sessionId || !state || profileLoaded) return;
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
    setRoadmapInstructions(p.roadmap_instructions ?? "");
    setProfileLoaded(true);
  }, [sessionId, state, profileLoaded]);

  useEffect(() => {
    if (!sessionId) return;
    getKnowledge(sessionId)
      .then(({ entries }) => setKnowledge(entries))
      .catch(() => setKnowledge([]));
  }, [sessionId]);

  async function handleDeleteKnowledge(entryId: string) {
    if (!sessionId) return;
    const confirmed = window.confirm("Are you sure you want to remove this extracted knowledge?");
    if (!confirmed) return;
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
        setSaved(false);
    try {
      const { state: newState } = await updateProfile(sessionId, {
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
        roadmap_instructions: roadmapInstructions,
      });
      updateState(newState);
      setSaved(true);
      if (continueAfter) {
        // New users see the "import context" step once, right after the
        // required-fields gate, before landing in chat.
        navigate("/import?onboarding=1");
      }
    } catch {
      toast("Couldn't save your profile - try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function processResume(file: File) {
    if (!sessionId || !file) return;
    if (file.type !== "application/pdf") {
      setResumeError("Please upload a PDF file.");
      return;
    }
    setUploading(true);
    setResumeError(null);
    setResumeSaved(false);
    try {
      const { state: newState } = await uploadResume(sessionId, file);
      updateState(newState);
      // Auto-fill the form from whatever the resume extraction newly
      // populated - fills blanks only, so anything already typed in stays.
      const p = newState.learner_profile;
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
      setRoadmapInstructions((prev) => prev || p.roadmap_instructions || "");
      setResumeSaved(true);
      
      // Also fetch updated knowledge as resume extraction creates new knowledge
      getKnowledge(sessionId)
        .then(({ entries }) => setKnowledge(entries))
        .catch(() => {});
      toast("Resume processed successfully.", "success");
    } catch {
      setResumeError("Couldn't read that PDF - try a different file.");
      toast("Couldn't read that PDF.", "error");
    } finally {
      setUploading(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await processResume(file);
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processResume(file);
  }

  async function handleImportContext() {
    if (!sessionId || !importText.trim() || importingContext) return;
    setImportingContext(true);
    setImportSuccess(false);
    try {
      const { state: newState } = await importContext(sessionId, importText);
      updateState(newState);
      setImportText("");
      setImportSuccess(true);
      // Fetch updated knowledge
      getKnowledge(sessionId)
        .then(({ entries }) => setKnowledge(entries))
        .catch(() => {});
      toast("Context imported successfully.", "success");
    } catch {
      toast("Failed to import context.", "error");
    } finally {
      setImportingContext(false);
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
      navigate("/app");
    } catch {
      setRestarting(false);
      toast("Failed to start new goal.", "error");
    }
  }

  if (!sessionId || !state) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <PageSkeleton />
      </div>
    );
  }

  const assessments = state.skill_gap_map.assessments;

  const resumeSection = (
    <div 
      className={`glass-panel p-6 rounded-2xl animate-fade-in-up transition-colors duration-300 ${isDragging ? "border-slate-400 bg-slate-400/10" : ""}`}
      style={{ animationDelay: '0.1s' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-3 mb-3">
        <FileText className="w-5 h-5 text-slate-300" />
        <h2 className="text-base font-semibold text-slate-100 font-display">Resume</h2>
      </div>
      <p className="mb-4 text-sm text-slate-400 leading-relaxed">
        {isRequired
          ? "Upload a PDF and we'll auto-fill as much of the form below as we can find - " +
            "name, age, gender, skills, certifications, hobbies, and more. Anything it can't " +
            "find, just fill in yourself."
          : "PDF only. We'll pull skills, certifications, hobbies, and other details out to " +
            "auto-fill your profile below, and use it to personalize your roadmap and chats."}
      </p>
      {state.learner_profile.resume_filename && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-400/20 bg-slate-400/5 px-4 py-3 text-sm">
          <span className="truncate text-slate-200 font-medium flex items-center gap-2">
            <FileText className="w-4 h-4" /> {state.learner_profile.resume_filename}
            {state.learner_profile.resume_uploaded_at && (
              <span className="text-slate-300/60 font-normal">
                {" "}
                Â· uploaded {new Date(state.learner_profile.resume_uploaded_at).toLocaleDateString()}
              </span>
            )}
          </span>
          <button
            onClick={async () => {
              try {
                const blob = await getResumeFile(sessionId);
                const url = URL.createObjectURL(blob);
                window.open(url, "_blank", "noreferrer");
              } catch {
                setResumeError("Couldn't load your resume PDF.");
              }
            }}
            className="shrink-0 text-slate-300 font-medium hover:text-slate-300 transition-colors"
          >
            View PDF
          </button>
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
        className="flex items-center gap-2 rounded-xl bg-slate-800 border border-slate-700 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-700 disabled:opacity-50"
      >
        <Upload className="w-4 h-4" />
        {uploading
          ? "Reading resume..."
          : state.learner_profile.resume_filename
            ? "Upload a new PDF"
            : "Choose PDF"}
      </button>
      {uploading && (
        <div className="mt-4">
          <BuildingIndicator label="Reading your resume and building your profile..." />
        </div>
      )}
      {resumeSaved && !uploading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 px-4 py-2.5 rounded-xl">
          <CheckCircle className="w-4 h-4" /> Resume read successfully - fields below were auto-filled.
        </div>
      )}
      {resumeError && <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-lg">{resumeError}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 relative overflow-hidden">
      <div className="relative z-10 mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div className="glass-panel p-8 rounded-3xl animate-fade-in-up">
          <h1 className="text-3xl font-bold font-display tracking-tight text-slate-100 mb-2">Your Profile</h1>
          <p className="text-base text-slate-400 font-medium">
            This is what we&apos;ve gathered about you so far. Fix anything that&apos;s wrong - it shapes your roadmap.
          </p>
          {isRequired && (
            <div className="mt-4 rounded-xl border border-slate-400/30 bg-slate-400/10 px-5 py-4 text-sm text-slate-200 font-medium">
              Welcome! Fill in a few required details before we get started - or upload your
              resume below and we'll fill in what we can for you.
            </div>
          )}
        </div>

        {isRequired && resumeSection}

        <div className="glass-panel p-8 rounded-3xl animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-3 mb-6">
            <User className="w-5 h-5 text-slate-300" />
            <h2 className="text-lg font-semibold text-slate-100 font-display">Personal Details</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Name *">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Jane Doe" />
            </Field>
            <Field label="Email *">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                className={inputClass}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Age *">
              <input
                value={age}
                onChange={(e) => setAge(e.target.value)}
                type="number"
                min={1}
                className={inputClass}
                placeholder="e.g. 25"
              />
            </Field>
            <Field label="Gender *">
              <input value={gender} onChange={(e) => setGender(e.target.value)} className={inputClass} placeholder="e.g. Female" />
            </Field>
            <Field label="Currently *">
              <div className="relative">
                <select
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value as OccupationStatus)}
                  className={`${inputClass} appearance-none cursor-pointer`}
                >
                  <option value="">Select...</option>
                  <option value="student">Student</option>
                  <option value="working_professional">Working Professional</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                  <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>
            </Field>
            {occupation === "student" && (
              <Field label="Percentage / marks (optional)">
                <input
                  value={studentPercentage}
                  onChange={(e) => setStudentPercentage(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 85%"
                />
              </Field>
            )}
            {occupation === "working_professional" && (
              <Field label="Current role (optional)">
                <input
                  value={professionalRole}
                  onChange={(e) => setProfessionalRole(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Software Engineer"
                />
              </Field>
            )}
          </div>
        </div>

        <div className="glass-panel p-8 rounded-3xl animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center gap-3 mb-6">
            <Brain className="w-5 h-5 text-slate-300" />
            <h2 className="text-lg font-semibold text-slate-100 font-display">Learning Profile</h2>
          </div>
          <div className="space-y-5">
            <Field label="Goal">
              <input value={goal} onChange={(e) => setGoal(e.target.value)} className={inputClass} placeholder="e.g. Master React in 2 months" />
            </Field>
            <Field label="Timeline">
              <input value={timeline} onChange={(e) => setTimeline(e.target.value)} className={inputClass} placeholder="e.g. 5 hours a week" />
            </Field>
            <Field label="Interests (comma-separated)">
              <input value={interests} onChange={(e) => setInterests(e.target.value)} className={inputClass} placeholder="e.g. web dev, ui/ux" />
            </Field>
            <Field label="Known skills (comma-separated)">
              <input
                value={knownSkills}
                onChange={(e) => setKnownSkills(e.target.value)}
                className={inputClass}
                placeholder="e.g. javascript, html"
              />
            </Field>
            <Field label="Prior learning history (comma-separated)">
              <input
                value={priorHistory}
                onChange={(e) => setPriorHistory(e.target.value)}
                className={inputClass}
                placeholder="e.g. bootcamp 2022"
              />
            </Field>
            <Field label="Hobbies (comma-separated)">
              <input value={hobbies} onChange={(e) => setHobbies(e.target.value)} className={inputClass} placeholder="e.g. chess, guitar" />
            </Field>
            <Field label="Certifications (comma-separated)">
              <input
                value={certifications}
                onChange={(e) => setCertifications(e.target.value)}
                className={inputClass}
                placeholder="e.g. AWS Practitioner"
              />
            </Field>
          </div>
        </div>

        <div className="glass-panel p-8 rounded-3xl animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <div className="flex items-center gap-3 mb-4">
            <PenTool className="w-5 h-5 text-slate-300" />
            <h2 className="text-lg font-semibold text-slate-100 font-display">Extra Information</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            Anything else worth knowing that doesn&apos;t fit the fields above - awards,
            publications, languages, volunteer work, open-source contributions, etc. Pulled
            automatically from your resume where possible; edit freely. This feeds into how
            your roadmap and chats are personalized, same as everything else here.
          </p>
          <textarea
            value={extraInfo}
            onChange={(e) => setExtraInfo(e.target.value)}
            rows={5}
            placeholder="e.g. Fluent in Spanish, published two open-source npm packages, volunteer coding tutor on weekends..."
            className={`${inputClass} resize-y`}
          />
        </div>

        <div className="glass-panel p-8 rounded-3xl animate-fade-in-up" style={{ animationDelay: '0.45s' }}>
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-5 h-5 text-slate-300" />
            <h2 className="text-lg font-semibold text-slate-100 font-display">Personalization</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            Provide explicit instructions on how you want your roadmap generated.
          </p>
          <textarea
            value={roadmapInstructions}
            onChange={(e) => setRoadmapInstructions(e.target.value)}
            rows={4}
            placeholder="e.g. Focus on practical projects, minimize theory, include AWS deployment..."
            className={`${inputClass} resize-y`}
          />
        </div>

        <div className="sticky bottom-6 z-20 mx-auto max-w-3xl glass-panel p-4 rounded-2xl flex items-center justify-between gap-4 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
          <div className="flex-1">
            {saved && !isRequired && <p className="text-sm font-medium text-green-400 bg-green-500/10 px-3 py-1.5 rounded-lg inline-block">Saved successfully.</p>}
          </div>
          {isRequired ? (
            <button
              onClick={() => handleSave(true)}
              disabled={saving || !requiredFieldsFilled}
              className="rounded-xl bg-slate-100 px-8 py-3 text-sm font-bold text-slate-900 transition-all hover:bg-slate-200 hover:scale-105 hover:shadow-lg hover:shadow-slate-950/50 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Continue to Chat"}
            </button>
          ) : (
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="rounded-xl bg-slate-100 px-8 py-3 text-sm font-bold text-slate-900 transition-all hover:bg-slate-200 hover:scale-105 hover:shadow-lg hover:shadow-slate-950/50 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Profile"}
            </button>
          )}
        </div>

        {!isRequired && (
          <div className="space-y-8 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
            {knowledge.length > 0 && (
              <div className="glass-panel p-8 rounded-3xl">
                <div className="flex items-center gap-3 mb-4">
                  <Lightbulb className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-semibold text-slate-100 font-display">Key Points</h2>
                </div>
                <p className="mb-6 text-sm text-slate-400 leading-relaxed">
                  Extracted from what you&apos;ve imported or uploaded. Remove anything that&apos;s
                  wrong - it feeds directly into how your roadmap is shaped.
                </p>
                <div className="grid gap-6 sm:grid-cols-2">
                  {Object.entries(
                    knowledge.reduce<Record<string, KnowledgeEntry[]>>((acc, entry) => {
                      (acc[entry.category] ??= []).push(entry);
                      return acc;
                    }, {}),
                  ).map(([category, entries]) => (
                    <div key={category} className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                      <h3 className="mb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {CATEGORY_LABEL[category] ?? category}
                      </h3>
                      <ul className="space-y-2">
                        {entries.map((entry) => (
                          <li
                            key={entry.id}
                            className="flex items-start justify-between gap-3 text-sm text-slate-100 group"
                          >
                            <span className="leading-snug">{entry.content}</span>
                            <button
                              onClick={() => handleDeleteKnowledge(entry.id)}
                              className="shrink-0 p-1.5 rounded-lg bg-slate-800 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                              title="Remove"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

            <div className="grid sm:grid-cols-2 gap-8">
              <div className="glass-panel p-6 rounded-2xl flex flex-col">
                <div className="flex items-center gap-3 mb-3">
                  <Import className="w-5 h-5 text-slate-300" />
                  <h2 className="text-base font-semibold text-slate-100 font-display">Import from another AI</h2>
                </div>
                <p className="mb-4 text-sm text-slate-400 leading-relaxed">
                  Paste your previous AI-generated learning/profile summary.
                </p>
                <textarea 
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  className={`${inputClass} mb-4 resize-y`}
                  rows={4}
                  placeholder="Paste context here..."
                />
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleImportContext}
                    disabled={importingContext || !importText.trim()}
                    className="w-fit rounded-xl bg-slate-800 border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-100 transition-all hover:bg-slate-700 disabled:opacity-50"
                  >
                    {importingContext ? "Importing..." : "Import Context"}
                  </button>
                  {importSuccess && <span className="text-green-400 text-sm font-medium">Imported!</span>}
                </div>
              </div>

              {state.roadmap && (
                <div className="glass-panel p-6 rounded-2xl border-red-500/30 bg-red-500/5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <RotateCcw className="w-5 h-5 text-red-400" />
                      <h2 className="text-base font-semibold text-red-100 font-display">Start a New Goal</h2>
                    </div>
                    <p className="mb-6 text-sm text-red-200/60 leading-relaxed">
                      Ready to learn something else? This clears your current roadmap and skill
                      assessment - your personal details stay the same.
                    </p>
                  </div>
                  <button
                    onClick={handleStartNewGoal}
                    disabled={restarting}
                    className="w-fit rounded-xl bg-red-500/10 border border-red-500/20 px-5 py-2.5 text-sm font-semibold text-red-400 transition-all hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                  >
                    {restarting ? "Starting..." : "Start a new goal"}
                  </button>
                </div>
              )}
            </div>

            <div className="glass-panel p-8 rounded-3xl">
              <div className="flex items-center gap-3 mb-4">
                <Target className="w-5 h-5 text-slate-300" />
                <h2 className="text-lg font-semibold text-slate-100 font-display">
                  Skill Assessment Results
                </h2>
              </div>
              <p className="mb-6 text-sm text-slate-400">
                Read-only - these come from your quiz results, not self-reported.
              </p>
              {assessments.length === 0 ? (
                <div className="bg-slate-900/50 rounded-xl p-6 text-center border border-slate-800">
                  <p className="text-sm font-medium text-slate-500">No skills assessed yet.</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {assessments.map((a) => (
                    <div key={a.concept} className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                      <span className="text-sm font-medium text-slate-100">{a.concept}</span>
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${SKILL_STATUS_COLOR[a.status] ?? "text-slate-400"}`}>
                        {a.status.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
