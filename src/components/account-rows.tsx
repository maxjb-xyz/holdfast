import type { AccountLine } from "@/lib/full-pages";
import { toggleAccount } from "@/server/actions";

/**
 * Linked accounts as rows with a switch for whether each counts toward the
 * person's score. Each row is a form, so it works without JavaScript.
 */
export function AccountRows({
  accounts,
  back,
}: {
  accounts: readonly AccountLine[];
  /** The page to land on after a switch is flipped. */
  back: string;
}) {
  const counted = accounts.filter((a) => a.counted).length;
  return (
    <>
      {accounts.map((a, i) => (
        <form
          key={a.id}
          action={toggleAccount}
          className="hf-row flex min-h-[60px] items-center justify-between gap-4 border-t border-faint"
          style={{ "--i": i } as React.CSSProperties}
        >
          <input type="hidden" name="accountId" value={a.id} />
          <input type="hidden" name="on" value={String(!a.counted)} />
          <input type="hidden" name="back" value={back} />
          <span className="flex min-w-0 flex-col leading-[1.35]">
            <span
              className={`truncate text-[15px] font-medium ${a.counted ? "text-text" : "text-dim"}`}
            >
              {a.title}
            </span>
            {a.detail && (
              <span className="truncate font-mono text-[11px] text-grey">
                {a.detail}
              </span>
            )}
          </span>
          <span className="flex flex-none items-center gap-3.5">
            <span className={`text-xs ${a.counted ? "text-sub" : "text-grey"}`}>
              {a.counted ? "Counts" : "Left out"}
            </span>
            <button
              type="submit"
              role="switch"
              aria-checked={a.counted}
              aria-label={`${a.title} counts toward your score`}
              disabled={a.counted && counted === 1}
              title={
                a.counted && counted === 1
                  ? "At least one account has to count"
                  : undefined
              }
              className={`flex h-6 w-10 flex-none cursor-pointer items-center rounded-xl border p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                a.counted
                  ? "border-text bg-text"
                  : "border-rule bg-transparent hover:border-grey"
              }`}
            >
              <span
                className={`size-[18px] rounded-full transition-[margin] ${a.counted ? "ml-[18px] bg-bg" : "ml-0.5 bg-dim"}`}
              />
            </button>
          </span>
        </form>
      ))}
    </>
  );
}
