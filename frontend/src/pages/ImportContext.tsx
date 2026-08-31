import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { importContext, uploadResume } from "../api";
import BuildingIndicator from "../components/BuildingIndicator";
import { useClipboardCopy } from "../hooks/useClipboardCopy";
import { useAppState } from "../context/AppStateContext";

// Verbatim from docs/context_export_prompt.md - what the user copies and
// pastes into another AI tool they've already talked to about their goals.
// Structured under fixed headings on purpose: backend/agents/knowledge_extractor.py
// parses the pasted reply into categorized facts, and consistent headings make
// that extraction far more reliable than free-form prose would.
const EXPORT_PROMPT = `Based on everything you know about me from our conversations, write a \
summary using exactly these headings. Under each one, list short bullet points (one fact per \
bullet) - only things we've actually discussed, don't guess or make anything up. If you have \
nothing for a heading, write "None mentioned".

Goals:
- (what I've said I want to learn or achieve)

Current Skills / Experience:
- (things I already know or have done, including my rough level)

Interests:
- (topics or areas I tend to ask about or seem drawn to)

Learning Style & Pace:
- (how I seem to prefer learning - pace, format, hands-on vs reading, etc.)

Constraints:
- (time available, deadlines, or anything limiting how I can learn)

Things I Find Difficult or Dislike:
- (topics I've struggled with or said I don't enjoy)

Format it as plain text I can copy elsewhere, keeping these exact headings.`;

export default function ImportContext() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "1";
  const { auth, updateState } = useAppState();
  const sessionId = auth?.session_id;
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { copied, copy } = useClipboardCopy();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resumeSaved, setResumeSaved] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) navigate("/login", { replace: true });
  }, [sessionId, navigate]);

  async function handleSave() {
    if (!sessionId || !text.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { state: newState } = await importContext(sessionId, text.trim());
      updateState(newState);
      setSaved(true);
    } catch {
      setError("Couldn't save that - try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!sessionId || !file) return;

    setUploading(true);
    setResumeError(null);
    setResumeSaved(false);
    try {
      const { state: newState } = await uploadResume(sessionId, file);
      updateState(newState);
      setResumeSaved(true);
    } catch {
      setResumeError("Couldn't read that PDF - try a different file.");
    } finally {
      setUploading(false);
    }
  }

  if (!sessionId) return null;

  return (
    <div className="min-h-screen bg-[#f7f5ed] text-emerald-950">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-3xl font-semibold tracking-[-0.045em] text-emerald-950">Bring your learning context with you</h1>
        <p className="mt-3 text-sm leading-6 text-emerald-950/62">
          Already talked to an AI assistant about your goals, skills, or interests? Copy the
          prompt below, paste it there, then paste the reply back here - it gives your
          Profiler a head start. Nothing leaves your control; you copy, read, and paste it
          yourself, and it's merged as a hint alongside what you tell us directly, not as a
          fact that overrides you.
        </p>
        {isOnboarding && (
          <div className="mt-4 rounded-xl border border-emerald-700/15 bg-emerald-100/70 px-4 py-3 text-sm text-emerald-900">
            Optional - do this now if you have context to bring in, or skip it and go straight
            to chat.
          </div>
        )}

        <div className="lp-surface mt-6 rounded-2xl p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">Step 1 — copy this prompt</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-emerald-950/8 bg-white/55 p-4 text-xs leading-5 text-emerald-950/65">
            {EXPORT_PROMPT}
          </pre>
          <button
            onClick={() => copy(EXPORT_PROMPT)}
            className="mt-3 rounded-xl bg-emerald-100 px-4 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-200"
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
        </div>

        <div className="lp-surface mt-6 rounded-2xl p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">Step 2 — paste the reply here</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full rounded-xl border border-emerald-950/14 bg-white/60 p-4 text-sm text-emerald-950 outline-none transition focus:border-emerald-700/35 focus:bg-white focus:ring-4 focus:ring-emerald-700/10"
            placeholder="Paste the other AI's reply here..."
          />
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="mt-3 rounded-xl bg-emerald-800 px-6 py-2.5 text-sm font-semibold text-amber-50 transition hover:bg-emerald-900 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && (
            <p className="mt-3 text-sm text-emerald-800">
              Saved - this'll help shape your roadmap next time it's generated.
            </p>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        </div>

        <div className="lp-surface mt-6 rounded-2xl p-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">Or upload your resume</p>
          <p className="mb-4 text-xs leading-5 text-emerald-950/55">
            PDF only, for now. We'll pull skills, certifications, hobbies, and personal details
            out to auto-fill your profile too - see the Profile page after this.
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
            className="rounded-xl bg-emerald-100 px-4 py-2 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-200 disabled:opacity-50"
          >
            {uploading ? "Reading resume..." : "Choose PDF"}
          </button>
          {uploading && <BuildingIndicator label="Reading your resume and building your profile..." className="mt-3" />}
          {resumeSaved && (
            <p className="mt-3 text-sm text-emerald-800">
              Resume read successfully - this'll help shape your roadmap next time it's
              generated.
            </p>
          )}
          {resumeError && <p role="alert" className="mt-3 text-sm text-red-700">{resumeError}</p>}
        </div>

        {isOnboarding && (
          <button
            onClick={() => navigate("/app")}
            className="mt-6 w-full rounded-xl bg-emerald-800 px-6 py-3 text-sm font-semibold text-amber-50 transition hover:-translate-y-0.5 hover:bg-emerald-900"
          >
            {saved || resumeSaved ? "Continue to Chat" : "Skip for now - Continue to Chat"}
          </button>
        )}
      </div>
    </div>
  );
}
