import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./chrome";
import { Icon } from "./icons";

/** Shared control styles for the pages outside the league and profile. */
export const solid =
  "flex min-h-11 flex-none cursor-pointer items-center gap-2 rounded-full border-0 bg-text px-[18px] text-[13px] font-semibold text-bg transition-colors hover:bg-white";
export const solidBig =
  "flex min-h-12 flex-none cursor-pointer items-center justify-center gap-2 rounded-full border-0 bg-text px-[22px] text-[15px] font-semibold text-bg transition-colors hover:bg-white";
export const outline =
  "flex min-h-10 flex-none cursor-pointer items-center gap-2 rounded-full border border-rule bg-transparent px-4 text-[13px] font-semibold text-text transition-colors hover:border-sub";
export const quiet =
  "hover-text flex min-h-11 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-dim";
export const field =
  "box-border min-h-11 w-full min-w-0 flex-[1_1_200px] rounded-full border border-rule bg-transparent px-4 text-text outline-none transition-colors placeholder:text-grey focus:border-sub";

/** The plain header used before someone has a league: wordmark and one link. */
export function BareHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-x-8 px-5 pt-1.5 lg:px-10 lg:py-3.5">
      <Wordmark href="/" />
      {children}
    </header>
  );
}

/** One line of feedback after an action, between two rules. */
export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="status"
      className="hf-rise m-0 flex items-start gap-3 border-t border-b border-rule py-3 text-sub"
    >
      <span className="mt-0.5 flex text-dim">
        <Icon name="info" />
      </span>
      <span>{children}</span>
    </p>
  );
}

/** "Leagues > Manage" above a page title. */
export function Crumb({
  href,
  parent,
  here,
}: {
  href: string;
  parent: string;
  here: string;
}) {
  return (
    <span className="label flex items-center gap-1.5">
      <Link href={href} className="hover-text">
        {parent}
      </Link>
      <Icon name="right" size={11} />
      {here}
    </span>
  );
}

/** A titled action with a button on the right, on one hairline row. */
export function ActionRow({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-faint py-2">
      <span className="flex flex-[1_1_220px] flex-col leading-[1.35]">
        <span>{title}</span>
        <span className="text-xs text-grey">{hint}</span>
      </span>
      {children}
    </div>
  );
}

/**
 * An action that asks once before it runs, without JavaScript: the row opens
 * to show what will happen and the button that does it.
 */
export function ConfirmRow({
  title,
  hint,
  open,
  children,
}: {
  title: string;
  hint: string;
  /** The label on the button that opens the row. */
  open: string;
  children: ReactNode;
}) {
  return (
    <details className="group border-t border-faint">
      <summary className="flex min-h-16 cursor-pointer list-none flex-wrap items-center justify-between gap-x-6 gap-y-2 py-2 [&::-webkit-details-marker]:hidden">
        <span className="flex flex-[1_1_220px] flex-col leading-[1.35]">
          <span>{title}</span>
          <span className="text-xs text-grey">{hint}</span>
        </span>
        <span className={`${outline} group-open:border-sub`}>
          <span className="group-open:hidden">{open}</span>
          <span className="hidden group-open:inline">Cancel</span>
        </span>
      </summary>
      <div className="hf-rise pb-3.5">{children}</div>
    </details>
  );
}

/** The three steps of the first run, as a strip. `active` counts from 0. */
export function Stepper({ active }: { active: number }) {
  const steps = ["Connect", "Accounts", "League"];
  return (
    <ol
      className="m-0 grid list-none grid-cols-3 gap-[3px] p-0"
      aria-label={`Step ${active + 1} of 3`}
    >
      {steps.map((name, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <li
            key={name}
            aria-current={current ? "step" : undefined}
            className="flex min-w-0 flex-col gap-2.5"
          >
            <span
              aria-hidden="true"
              className={`h-[3px] ${done ? "bg-text" : current ? "bg-you" : "bg-rule"}`}
            />
            <span
              className={`flex items-center gap-2 ${
                current
                  ? "font-medium text-text"
                  : done
                    ? "text-sub"
                    : "text-grey"
              }`}
            >
              {done ? (
                <Icon name="check" size={13} stroke={1.8} />
              ) : (
                <span className="font-mono text-[11px]">0{i + 1}</span>
              )}
              {name}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A strip of equal segments, some filled. Used for places and progress. */
export function Segments({
  done,
  of,
  className = "",
}: {
  done: number;
  of: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid gap-[3px] ${className}`}
      style={{ gridTemplateColumns: `repeat(${of}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={`h-[3px] ${i < done ? "bg-text" : "bg-rule"}`}
        />
      ))}
    </span>
  );
}
