import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { importContext, uploadResume } from "../api";
import NavBar from "../components/NavBar";
import { useClipboardCopy } from "../hooks/useClipboardCopy";
import { getSessionId } from "../session";

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
  const sessionId = getSessionId();
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
      await importContext(sessionId, text.trim());
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
      await uploadResume(sessionId, file);
      setResumeSaved(true);
    } catch {
      setResumeError("Couldn't read that PDF - try a different file.");
    } finally {
      setUploading(false);
    }
  }

  if (!sessionId) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-bold">Import context from another AI</h1>
        <p className="mt-2 text-sm text-slate-400">
          Already talked to an AI assistant about your goals, skills, or interests? Copy the
          prompt below, paste it there, then paste the reply back here - it gives your
          Profiler a head start. Nothing leaves your control; you copy, read, and paste it
          yourself, and it's merged as a hint alongside what you tell us directly, not as a
          fact that overrides you.
        </p>
        {isOnboarding && (
          <div className="mt-3 rounded-lg border border-indigo-800 bg-indigo-950/40 px-4 py-3 text-sm text-indigo-200">
            Optional - do this now if you have context to bring in, or skip it and go straight
            to chat.
          </div>
        )}

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="mb-2 text-xs font-medium text-slate-300">Step 1 — copy this prompt</p>
          <pre className="whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs text-slate-300">
            {EXPORT_PROMPT}
          </pre>
          <button
            onClick={() => copy(EXPORT_PROMPT)}
            className="mt-2 rounded-md bg-slate-700 px-3 py-1 text-xs font-medium transition hover:bg-slate-600"
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="mb-2 text-xs font-medium text-slate-300">Step 2 — paste the reply here</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full rounded-md bg-slate-950 p-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Paste the other AI's reply here..."
          />
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="mt-3 rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && (
            <p className="mt-2 text-sm text-green-400">
              Saved - this'll help shape your roadmap next time it's generated.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="mb-2 text-xs font-medium text-slate-300">Or upload your resume</p>
          <p className="mb-3 text-xs text-slate-500">
            PDF only, for now. We'll pull the text out and use it the same way - a hint for
            your Profiler, never treated as fact on its own.
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
          {resumeSaved && (
            <p className="mt-2 text-sm text-green-400">
              Resume read successfully - this'll help shape your roadmap next time it's
              generated.
            </p>
          )}
          {resumeError && <p className="mt-2 text-sm text-red-400">{resumeError}</p>}
        </div>

        {isOnboarding && (
          <button
            onClick={() => navigate("/chat")}
            className="mt-6 w-full rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold transition hover:bg-indigo-400"
          >
            {saved || resumeSaved ? "Continue to Chat" : "Skip for now - Continue to Chat"}
          </button>
        )}
      </div>
    </div>
  );
}
