import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/chrome";
import { Icon } from "@/components/icons";
import { BADGES, BADGE_KEYS } from "@/lib/badges";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "How Holdfast scores a league, what partial and paused mean, and what it does with your data.",
};

const SECTIONS: { title: string; points: { term: string; text: string }[] }[] =
  [
    {
      title: "Fair scoring",
      points: [
        {
          term: "Percentage return, nothing else",
          text: "A league is ranked on each member's return for the calendar quarter. A small account and a large one compete on equal terms.",
        },
        {
          term: "Deposits never count",
          text: "Each day's return is measured after taking out money added or withdrawn that day, and the days are chained together. Adding money cannot move your score.",
        },
        {
          term: "Late joiners start at zero",
          text: "Everyone begins at 0% on the day they join and is scored from the next day. What your account did before you joined is not counted.",
        },
        {
          term: "Quarters reset",
          text: "Standings start again every January, April, July and October. Finished quarters stay on your profile.",
        },
      ],
    },
    {
      title: "Honest data",
      points: [
        {
          term: "Partial",
          text: "When a brokerage gives incomplete data for a day, that stretch of your line is dotted and your score is labelled partial. You keep your rank. Holdfast says partial instead of guessing.",
        },
        {
          term: "Paused",
          text: "If your brokerage link drops, your score is held where it was and your rank shows as paused, not zero. Reconnect and it picks up again.",
        },
        {
          term: "Daily",
          text: "Accounts sync once a day. A quarterly league does not need anything faster.",
        },
      ],
    },
    {
      title: "Your data",
      points: [
        {
          term: "Read-only",
          text: "Holdfast signs you in through SnapTrade and asks only to read. It never asks for permission to trade.",
        },
        {
          term: "Percentages only",
          text: "Friends see percentages and badges. Dollar amounts are never shown to anyone. Your holdings list is visible only to you.",
        },
        {
          term: "What is kept",
          text: "A daily percentage return for each counted account, your habits as dates and tickers, and your badges. Balances are kept for ten days so a late-reported deposit can be corrected, then deleted.",
        },
        {
          term: "Leaving",
          text: "You can leave a league, or delete everything in one step. Deleting revokes Holdfast's SnapTrade access and removes your data.",
        },
      ],
    },
  ];

export default function HowItWorks() {
  return (
    <>
      <header className="flex items-center justify-between px-5 pt-1.5 lg:px-10 lg:py-3.5">
        <Wordmark href="/" />
        <Link
          href="/league"
          className="hover-text flex min-h-11 items-center gap-2 font-medium text-dim"
        >
          Open the app
          <Icon name="arrow" size={15} />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-14 px-5 pt-8 pb-16 lg:px-10">
        <div className="flex flex-col gap-4">
          <span className="label">How it works</span>
          <h1 className="serif m-0 max-w-[16ch] text-[40px] leading-[1.02] lg:text-[56px]">
            A league that rewards patience.
          </h1>
          <p className="m-0 max-w-[56ch] text-[17px] text-sub">
            Holdfast scores how well and how steadily you invest. There are no
            points for trading more, and nobody sees how much money anyone has.
          </p>
        </div>
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="grid gap-x-14 gap-y-4 lg:grid-cols-[220px_minmax(0,1fr)]"
          >
            <h2 className="label m-0 pt-3.5 font-normal">{section.title}</h2>
            <dl className="m-0 border-b border-faint">
              {section.points.map((p) => (
                <div
                  key={p.term}
                  className="grid gap-x-10 gap-y-1 border-t border-faint py-3.5 sm:grid-cols-[220px_minmax(0,1fr)]"
                >
                  <dt className="font-medium">{p.term}</dt>
                  <dd className="m-0 max-w-[60ch] text-sub">{p.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <section className="grid gap-x-14 gap-y-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <h2 className="label m-0 pt-3.5 font-normal">Badges</h2>
          <dl className="m-0 border-b border-faint">
            {BADGE_KEYS.map((key) => (
              <div
                key={key}
                className="flex items-center gap-4 border-t border-faint py-3"
              >
                <span
                  className="flex size-11 flex-none items-center justify-center rounded-full border border-sub text-xs tracking-[-0.02em]"
                  aria-hidden="true"
                >
                  {BADGES[key].mark}
                </span>
                <div className="flex flex-col">
                  <dt className="font-medium">{BADGES[key].name}</dt>
                  <dd className="m-0 text-sub">{BADGES[key].rule}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </>
  );
}
