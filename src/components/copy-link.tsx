"use client";

import { useState } from "react";
import { Icon } from "./icons";

/** An invite link with a button that copies it. Works without JavaScript as plain text. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex w-full min-w-0 items-center gap-2.5">
      <span className="flex text-grey">
        <Icon name="link" size={15} />
      </span>
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
        <Icon name={copied ? "check" : "copy"} size={14} />
        <span aria-live="polite" className="ml-1.5">
          {copied ? "Copied" : "Copy link"}
        </span>
      </button>
    </span>
  );
}
