"use client";

import { useState } from "react";

export type StartChoice = "quarter" | "today" | "custom";

/**
 * Chooses the first day a new league is scored from. Posts one field,
 * `startOn`, as YYYY-MM-DD; empty means the league starts today. Without
 * JavaScript the field keeps its default, the start of the quarter.
 */
export function StartPicker({
  quarterStart,
  quarterStartLabel,
  todayLabel,
  earliest,
  latest,
  compact = false,
  onChange,
}: {
  quarterStart: string;
  quarterStartLabel: string;
  todayLabel: string;
  /** The oldest and newest day the custom date may be. */
  earliest: string;
  latest: string;
  compact?: boolean;
  onChange?: (choice: StartChoice, startOn: string) => void;
}) {
  // On the first day of a quarter the two fixed choices are the same day.
  const quarterUsable = quarterStart <= latest;
  const [choice, setChoice] = useState<StartChoice>(
    quarterUsable ? "quarter" : "today",
  );
  const [custom, setCustom] = useState("");
  const startOn =
    choice === "quarter" ? quarterStart : choice === "custom" ? custom : "";

  const pick = (next: StartChoice, date = custom) => {
    setChoice(next);
    onChange?.(
      next,
      next === "quarter" ? quarterStart : next === "custom" ? date : "",
    );
  };

  const options: { key: StartChoice; title: string; hint: string }[] = [
    ...(quarterUsable
      ? [
          {
            key: "quarter" as const,
            title: compact
              ? "Score from the start of the quarter"
              : `Start of this quarter, ${quarterStartLabel}`,
            hint: compact
              ? `${quarterStartLabel}. Uses your brokerage history where it is available.`
              : "Fills in each member's line from their brokerage history where it is available.",
          },
        ]
      : []),
    {
      key: "today",
      title: compact ? "Score from today" : `Today, ${todayLabel}`,
      hint: compact
        ? "Everyone begins at 0% on the day they join."
        : "Everyone begins at 0% and is scored from tomorrow.",
    },
    {
      key: "custom",
      title: "Another date",
      hint: compact
        ? "Up to a year back."
        : "Any day in the past year. Scores still reset each quarter.",
    },
  ];

  return (
    <fieldset className="m-0 flex min-w-0 flex-col border-0 border-b border-faint p-0">
      <legend className="sr-only">Scoring starts</legend>
      <input type="hidden" name="startOn" value={startOn} />
      {options.map((o) => {
        const on = choice === o.key;
        return (
          <label
            key={o.key}
            className="flex min-h-[52px] cursor-pointer items-center gap-3.5 border-t border-faint py-1.5"
          >
            <input
              type="radio"
              name="startChoice"
              value={o.key}
              checked={on}
              onChange={() => pick(o.key)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`flex size-4 flex-none items-center justify-center rounded-full border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-you ${
                on ? "border-text" : "border-grey"
              }`}
            >
              <span
                className={`size-2 rounded-full bg-text transition-transform duration-150 ${on ? "scale-100" : "scale-0"}`}
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-[1.35]">
              <span className={on ? "text-text" : "text-sub"}>{o.title}</span>
              <span className="text-xs text-grey">{o.hint}</span>
            </span>
            {o.key === "custom" && (
              <span
                className={`flex min-h-9 flex-none items-center rounded-full border px-3 font-mono text-xs transition-colors ${
                  on ? "border-sub text-text" : "border-rule text-dim"
                }`}
              >
                <input
                  type="date"
                  aria-label="League start date"
                  min={earliest}
                  max={latest}
                  value={custom}
                  onFocus={() => pick("custom")}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    pick("custom", e.target.value);
                  }}
                  className="w-[118px] border-0 bg-transparent p-0 font-mono text-xs text-inherit outline-none [color-scheme:dark]"
                />
              </span>
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
