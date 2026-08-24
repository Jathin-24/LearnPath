import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { importContext, uploadResume } from "../api";
import NavBar from "../components/NavBar";
import { getSessionId } from "../session";

// Verbatim from docs/context_export_prompt.md - what the user copies and
// pastes into another AI tool they've already talked to about their goals.
const EXPORT_PROMPT = `Based on everything you know about me from our conversations, please summarize:
1. My career goals or things I've said I want to learn or achieve
2. My current skills, experience, or background you're aware of
3. My interests and the kinds of topics I tend to ask about
4. Any learning preferences you've noticed (pace, style, formats I prefer)

Please keep it factual and based only on what we've actually discussed - don't
guess or make anything up. Format it as plain text I can copy elsewhere.`;

export default function ImportContext() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resumeSaved, setResumeSaved] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) navigate("/login", { replace: true });
  }, [sessionId, navigate]);

  async function handleCopy() {
    await navigator.clipboard.writeText(EXPORT_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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

        <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="mb-2 text-xs font-medium text-slate-300">Step 1 — copy this prompt</p>
          <pre className="whitespace-pre-wrap rounded-md bg-slate-950 p-3 text-xs text-slate-300">
            {EXPORT_PROMPT}
          </pre>
          <button
            onClick={handleCopy}
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
      </div>
    </div>
  );
}
