import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { importContext, uploadResume } from "../api";
import { Button, Card, Textarea } from "../components/nb";
import BuildingIndicator from "../components/BuildingIndicator";
import NavBar from "../components/NavBar";
import { useClipboardCopy } from "../hooks/useClipboardCopy";
import { getSessionId } from "../session";

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

  if (!sessionId) return null;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <NavBar />
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Import Context from Another AI
        </h1>
        <p className="mt-2 text-sm text-fg-secondary">
          Already talked to an AI assistant about your goals, skills, or interests? Copy the
          prompt below, paste it there, then paste the reply back here - it gives your
          Profiler a head start.
        </p>
        {isOnboarding && (
          <div className="mt-3 bg-purple/5 border border-purple/20 rounded-xl px-5 py-3 text-sm text-fg-secondary">
            Optional - do this now if you have context to bring in, or skip it and go straight to chat.
          </div>
        )}

        <Card className="mt-6">
          <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Step 1 — Copy this prompt</p>
          <pre className="whitespace-pre-wrap border border-border bg-bg-secondary rounded-lg p-3 text-xs font-mono text-fg-secondary">
            {EXPORT_PROMPT}
          </pre>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => copy(EXPORT_PROMPT)}
          >
            {copied ? "Copied!" : "Copy to clipboard"}
          </Button>
        </Card>

        <Card className="mt-6">
          <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Step 2 — Paste the reply here</p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Paste the other AI's reply here..."
          />
          <Button
            className="mt-3"
            onClick={handleSave}
            disabled={saving || !text.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          {saved && (
            <p className="mt-2 text-sm font-medium text-success">
              Saved - this'll help shape your roadmap next time it's generated.
            </p>
          )}
          {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
        </Card>

        <Card className="mt-6">
          <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Or upload your resume</p>
          <p className="mb-3 text-xs text-fg-muted">
            PDF only, for now. We'll pull skills, certifications, hobbies, and personal details
            out to auto-fill your profile too.
          </p>
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={handleFileSelected} className="hidden" />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Reading resume..." : "Choose PDF"}
          </Button>
          {uploading && <BuildingIndicator label="Reading your resume and building your profile..." className="mt-3" />}
          {resumeSaved && (
            <p className="mt-2 text-sm font-medium text-success">
              Resume read successfully - this'll help shape your roadmap.
            </p>
          )}
          {resumeError && <p className="mt-2 text-sm font-medium text-danger">{resumeError}</p>}
        </Card>

        {isOnboarding && (
          <Button
            size="lg"
            className="mt-6 w-full"
            onClick={() => navigate("/chat")}
          >
            {saved || resumeSaved ? "Continue to Chat" : "Skip for now - Continue to Chat"}
          </Button>
        )}
      </div>
    </div>
  );
}
