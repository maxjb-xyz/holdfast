"use client";

import { useState } from "react";

/** An invite link with a button that copies it. Works without JavaScript as plain text. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-sub select-all">
        {url}
      </span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setCopied(false);
          }
        }}
        className="flex min-h-9 flex-none cursor-pointer items-center rounded-full border border-rule bg-transparent px-3.5 text-[13px] font-medium text-text transition-colors hover:border-grey"
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
      </button>
    </span>
  );
}
