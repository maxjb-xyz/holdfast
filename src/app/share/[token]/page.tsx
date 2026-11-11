import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/chrome";
import { Icon } from "@/components/icons";
import { ShareCardSvg } from "@/components/share-card";
import { quarterLabel, signedPercent } from "@/lib/format";
import { readShareToken } from "@/server/share-token";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const card = await readShareToken((await params).token);
  if (!card) return { title: "Shared card" };
  const title = `${card.name}: ${signedPercent(card.value)} in ${quarterLabel(card.q)}`;
  return {
    title,
    description:
      "A Holdfast Wrapped card. Return with deposits and withdrawals removed. No dollar amounts.",
    robots: { index: false },
  };
}

/** A shared Wrapped card. Public, read-only, and built only from the signed link. */
export default async function SharedCard({ params }: Props) {
  const card = await readShareToken((await params).token);
  if (!card) notFound();
  return (
    <>
      <header className="flex items-center justify-between px-5 pt-1.5 lg:px-10 lg:py-3.5">
        <Wordmark href="/" />
      </header>
      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center gap-8 px-5 pt-4 pb-10">
        <ShareCardSvg card={card} />
        <div className="flex flex-col items-start gap-4">
          <p className="m-0 text-[15px] text-sub">
            Holdfast is a quarterly league for long-term investors. Friends
            compete on percentage return and steady habits, and nobody sees a
            dollar amount.
          </p>
          <Link
            href="/"
            className="flex min-h-12 items-center gap-2 rounded-full bg-text px-[22px] text-sm font-semibold text-bg transition-colors hover:bg-white"
          >
            See how it works
            <Icon name="arrow" size={16} stroke={1.8} />
          </Link>
        </div>
      </main>
    </>
  );
}
