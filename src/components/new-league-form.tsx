"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { StartPicker, type StartChoice } from "./start-picker";
import { quiet, solidBig } from "./ui";

/**
 * The new league page: the name is typed straight into the title, and the
 * preview beside it follows the name and the chosen start.
 */
export function NewLeagueForm({
  action,
  maxName,
  places,
  quarterLabel,
  picker,
  previewFromQuarter,
  previewFromToday,
  facts,
}: {
  action: (formData: FormData) => Promise<void>;
  maxName: number;
  places: number;
  quarterLabel: string;
  picker: {
    quarterStart: string;
    quarterStartLabel: string;
    todayLabel: string;
    earliest: string;
    latest: string;
  };
  /** The preview chart for a league scored from the start of the quarter. */
  previewFromQuarter: ReactNode;
  /** The preview chart for a league that starts today. */
  previewFromToday: ReactNode;
  facts: ReactNode;
}) {
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<StartChoice>(
    picker.quarterStart <= picker.latest ? "quarter" : "today",
  );
  const [startOn, setStartOn] = useState("");
  // A custom date inside this quarter draws the same line as the quarter start.
  const fromHistory =
    choice === "quarter" || (choice === "custom" && startOn !== "");
  return (
    <>
      <form
        action={action}
        className="flex max-w-[520px] min-w-0 flex-[1_1_400px] flex-col gap-9"
      >
        <input type="hidden" name="back" value="/leagues/new" />
        <div className="flex flex-col gap-3">
          <span className="label flex items-center gap-1.5">
            <Link href="/leagues" className="hover-text">
              Leagues
            </Link>
            <Icon name="right" size={11} />
            New
          </span>
          <label htmlFor="league-name" className="sr-only">
            League name
          </label>
          <input
            id="league-name"
            name="name"
            required
            autoFocus
            maxLength={maxName}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name your league"
            autoComplete="off"
            className="serif box-border w-full border-0 border-b border-rule bg-transparent pb-3 text-[32px] leading-[1.1] text-text outline-none transition-colors placeholder:text-grey focus:border-sub lg:text-[48px]"
          />
          <span className="flex justify-between gap-4 text-xs text-grey">
            <span>The name shows on the chart and on share cards.</span>
            <span className="font-mono">
              {name.length} / {maxName}
            </span>
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          <h2 className="label m-0 font-normal">Scoring starts</h2>
          <StartPicker
            {...picker}
            onChange={(next, date) => {
              setChoice(next);
              setStartOn(date);
            }}
          />
        </div>
        {facts}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <button type="submit" className={solidBig}>
            Create league
            <Icon name="arrow" size={16} stroke={1.8} />
          </button>
          <Link href="/leagues" className={quiet}>
            Cancel
          </Link>
        </div>
      </form>
      <section
        className="hidden min-w-0 flex-[999_1_520px] flex-col gap-[18px] sm:flex lg:pt-7"
        aria-label="Preview"
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="label">Preview · {quarterLabel}</span>
          <span className="label !text-grey">1 of {places} places</span>
        </div>
        <span
          className={`serif min-h-[31px] truncate text-[28px] leading-[1.1] transition-colors ${name.trim() ? "text-sub" : "text-grey"}`}
        >
          {name.trim() || "Your league"}
        </span>
        {fromHistory ? previewFromQuarter : previewFromToday}
      </section>
    </>
  );
}
