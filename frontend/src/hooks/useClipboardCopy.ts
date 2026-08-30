import { useState } from "react";

// Extracted from what was inline-only logic in ImportContext.tsx - copy
// text to the clipboard, flip a "Copied!" flag for 2s, then reset. Used by
// both the onboarding export prompt and the per-topic tutor prompts.
export function useClipboardCopy(resetMs = 2000) {
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), resetMs);
  }

  return { copied, copy };
}
