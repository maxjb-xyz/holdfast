import Link from "next/link";
import { Wordmark } from "@/components/chrome";
import { Icon } from "@/components/icons";

export default function NotFound() {
  return (
    <>
      <header className="flex items-center px-5 pt-1.5 lg:px-10 lg:py-3.5">
        <Wordmark href="/" />
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col justify-center gap-6 px-5 pb-24 lg:px-10">
        <span className="label">Not found</span>
        <h1 className="serif m-0 text-[40px] leading-[1.05]">
          Nothing here to hold on to.
        </h1>
        <p className="m-0 max-w-[48ch] text-[15px] text-sub">
          This page does not exist, or it belongs to a league you are not in.
        </p>
        <Link
          href="/league"
          className="hover-text flex min-h-11 items-center gap-2 font-medium"
        >
          Back to your league
          <Icon name="arrow" size={15} />
        </Link>
      </main>
    </>
  );
}
