import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  deleteKnowledgeEntry,
  getKnowledge,
  getState,
  resumeFileUrl,
  restartGoal,
  updateProfile,
  uploadResume,
} from "../api";
import { Button, Card, Input, Textarea, Badge } from "../components/nb";
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

function toCommaList(items: string[]): string {
  return items.join(", ");
}

function fromCommaList(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function Profile() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isRequired = searchParams.get("required") === "1";
  const sessionId = getSessionId();
  const [state, setState] = useState<AppState | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [occupation, setOccupation] = useState<OccupationStatus | "">("");
  const [studentPercentage, setStudentPercentage] = useState("");
  const [professionalRole, setProfessionalRole] = useState("");

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
      getKnowledge(sessionId).then(({ entries }) => setKnowledge(entries)).catch(() => {});
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
        name, email, age: age ? Number(age) : undefined, gender,
        occupation_status: occupation || undefined,
        student_percentage: studentPercentage, professional_role: professionalRole,
        goal, timeline, interests: fromCommaList(interests),
        stated_known_skills: fromCommaList(knownSkills),
        prior_learning_history: fromCommaList(priorHistory),
        hobbies: fromCommaList(hobbies), certifications: fromCommaList(certifications),
        extra_info: extraInfo,
      });
      setState(state);
      setSaved(true);
      if (continueAfter) navigate("/import?onboarding=1");
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
      setState(newState);
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
      setResumeSaved(true);
      if (result.extraction_warning) setExtractionWarning(result.extraction_warning);
    } catch {
      setResumeError("Couldn't read that PDF - try a different file.");
    } finally {
      setUploading(false);
    }
  }

  async function handleStartNewGoal() {
    if (!sessionId || restarting) return;
    const confirmed = window.confirm(
      "Start a new goal? This clears your current roadmap and skill assessment - your name/email/age/gender/occupation stay the same. This can't be undone.",
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
      <div className="min-h-screen bg-bg text-fg">
        <NavBar />
        <PageSkeleton />
      </div>
    );
  }

  const assessments = state.skill_gap_map.assessments;

  const resumeSection = (
    <Card>
      <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Resume</p>
      <p className="mb-3 text-xs text-fg-muted">
        {isRequired
          ? "Upload a PDF and we'll auto-fill as much of the form below as we can find."
          : "PDF only. We'll pull skills, certifications, hobbies, and other details out to auto-fill your profile."}
      </p>
      {state.learner_profile.resume_filename && (
        <div className="mb-3 flex items-center justify-between border border-border bg-bg-secondary rounded-lg px-3 py-2 text-xs">
          <span className="truncate font-medium">
            📄 {state.learner_profile.resume_filename}
            {state.learner_profile.resume_uploaded_at && (
              <span className="text-fg-muted">
                {" "}· uploaded {new Date(state.learner_profile.resume_uploaded_at).toLocaleDateString()}
              </span>
            )}
          </span>
          <a
            href={resumeFileUrl(sessionId)}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-fg font-medium hover:underline"
          >
            VIEW PDF
          </a>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelected} className="hidden" />
      <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
        {uploading ? "Reading resume..." : state.learner_profile.resume_filename ? "Upload a new PDF" : "Choose PDF"}
      </Button>
      {uploading && <BuildingIndicator label="Reading your resume and building your profile..." className="mt-3" />}
      {resumeSaved && !uploading && !extractionWarning && (
        <p className="mt-2 text-sm font-medium text-success">Resume read successfully - fields below were auto-filled.</p>
      )}
      {extractionWarning && !uploading && <p className="mt-2 text-sm font-medium text-warning">{extractionWarning}</p>}
      {resumeError && <p className="mt-2 text-sm font-medium text-danger">{resumeError}</p>}
    </Card>
  );

  return (
    <div className="min-h-screen bg-bg text-fg">
      <NavBar hasRoadmap={!!state.roadmap} />
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-2xl space-y-6 px-6 py-8"
      >
        <motion.div variants={itemVariants}>
          <h1 className="text-2xl font-semibold tracking-tight">Your Profile</h1>
          <p className="mt-2 text-sm text-fg-secondary">
            This is what we've gathered about you so far. Fix anything that's wrong - it shapes your roadmap.
          </p>
          {isRequired && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 bg-purple/5 border border-purple/20 rounded-xl px-5 py-3 text-sm text-fg-secondary"
            >
              Welcome! Fill in a few required details before we get started - or upload your resume below.
            </motion.div>
          )}
        </motion.div>

        {isRequired && <motion.div variants={itemVariants}>{resumeSection}</motion.div>}

        <motion.div variants={itemVariants}>
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Personal Details</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Email *" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
              <Input label="Age *" value={age} onChange={(e) => setAge(e.target.value)} type="number" min={1} />
              <Input label="Gender *" value={gender} onChange={(e) => setGender(e.target.value)} />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-fg-secondary">Currently *</label>
                <select
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value as OccupationStatus)}
                  className="w-full px-3.5 py-2.5 border border-border rounded-lg bg-surface text-fg text-sm outline-none transition-all duration-150 focus:border-fg/30"
                >
                  <option value="">Select...</option>
                  <option value="student">Student</option>
                  <option value="working_professional">Working Professional</option>
                </select>
              </div>
              {occupation === "student" && (
                <Input label="Percentage / marks (optional)" value={studentPercentage} onChange={(e) => setStudentPercentage(e.target.value)} />
              )}
              {occupation === "working_professional" && (
                <Input label="Current role (optional)" value={professionalRole} onChange={(e) => setProfessionalRole(e.target.value)} />
              )}
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Learning Profile</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
              <Input label="Timeline" value={timeline} onChange={(e) => setTimeline(e.target.value)} />
              <Input label="Interests (comma-separated)" value={interests} onChange={(e) => setInterests(e.target.value)} />
              <Input label="Known skills (comma-separated)" value={knownSkills} onChange={(e) => setKnownSkills(e.target.value)} />
              <Input label="Prior learning history (comma-separated)" value={priorHistory} onChange={(e) => setPriorHistory(e.target.value)} />
              <Input label="Hobbies (comma-separated)" value={hobbies} onChange={(e) => setHobbies(e.target.value)} />
            </div>
            <Input label="Certifications (comma-separated)" value={certifications} onChange={(e) => setCertifications(e.target.value)} className="mt-4" />
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Extra Information</p>
            <p className="text-xs text-fg-muted mb-2">
              Anything else worth knowing - awards, publications, languages, volunteer work, etc.
            </p>
            <Textarea
              value={extraInfo}
              onChange={(e) => setExtraInfo(e.target.value)}
              rows={4}
              placeholder="e.g. Fluent in Spanish, published two open-source npm packages..."
            />
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          {isRequired ? (
            <Button
              size="lg"
              className="w-full"
              onClick={() => handleSave(true)}
              disabled={saving || !requiredFieldsFilled}
            >
              {saving ? "Saving..." : "Continue to Chat →"}
            </Button>
          ) : (
            <Button onClick={() => handleSave(false)} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
          <AnimatePresence>
            {saved && !isRequired && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium text-success mt-2"
              >
                Saved.
              </motion.p>
            )}
          </AnimatePresence>
          {error && <p className="text-sm font-medium text-danger mt-2">{error}</p>}
        </motion.div>

        {!isRequired && (
          <>
            {knowledge.length > 0 && (
              <motion.div variants={itemVariants}>
                <Card>
                  <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Key Points</p>
                  <p className="text-xs text-fg-muted mb-3">
                    Extracted from what you've imported or uploaded. Remove anything that's wrong.
                  </p>
                  <div className="space-y-3">
                    {Object.entries(
                      knowledge.reduce<Record<string, KnowledgeEntry[]>>((acc, entry) => {
                        (acc[entry.category] ??= []).push(entry);
                        return acc;
                      }, {}),
                    ).map(([category, entries]) => (
                      <div key={category}>
                        <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-1">
                          {CATEGORY_LABEL[category] ?? category}
                        </p>
                        <ul className="space-y-1">
                          {entries.map((entry) => (
                            <motion.li
                              key={entry.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-start justify-between gap-3 text-sm border-b border-border pb-1"
                            >
                              <span>{entry.content}</span>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteKnowledge(entry.id)}>
                                Remove
                              </Button>
                            </motion.li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}

            <motion.div variants={itemVariants}>{resumeSection}</motion.div>

            <motion.div variants={itemVariants}>
              <Card>
                <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Import from another AI</p>
                <p className="text-xs text-fg-muted mb-3">
                  Already talked to an AI about your goals elsewhere? Bring that context in.
                </p>
                <Link to="/import">
                  <Button variant="secondary" size="sm">Import AI Context</Button>
                </Link>
              </Card>
            </motion.div>

            {state.roadmap && (
              <motion.div variants={itemVariants}>
                <Card className="border-danger/20 bg-danger/5">
                  <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Start a New Goal</p>
                  <p className="text-xs text-fg-muted mb-3">
                    Ready to learn something else? This clears your current roadmap and skill assessment.
                  </p>
                  <Button variant="danger" size="sm" onClick={handleStartNewGoal} disabled={restarting}>
                    {restarting ? "Starting..." : "Start a New Goal"}
                  </Button>
                </Card>
              </motion.div>
            )}

            <motion.div variants={itemVariants}>
              <Card>
                <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Skill Assessment Results</p>
                <p className="text-xs text-fg-muted mb-3">
                  Read-only - these come from your quiz results, not self-reported.
                </p>
                {assessments.length === 0 ? (
                  <p className="text-sm text-fg-muted">No skills assessed yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {assessments.map((a) => (
                      <motion.li
                        key={a.concept}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center justify-between text-sm border-b border-border pb-1"
                      >
                        <span className="font-medium">{a.concept}</span>
                        <Badge variant={
                          a.status === "known" || a.status === "learned" ? "success" :
                          a.status === "claimed_unconfirmed" ? "purple" : "danger"
                        }>
                          {a.status.replace("_", " ")}
                        </Badge>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </Card>
            </motion.div>
          </>
        )}
      </motion.div>
    </div>
  );
}
