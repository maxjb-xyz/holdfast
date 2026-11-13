import { pickNotice } from "@/lib/inputs";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountRows } from "@/components/account-rows";
import { Header, SectionHead, TabBar } from "@/components/chrome";
import { Icon } from "@/components/icons";
import { Switch } from "@/components/profile-parts";
import {
  ActionRow,
  ConfirmRow,
  Notice,
  field,
  outline,
  quiet,
  solid,
} from "@/components/ui";
import { accountLine } from "@/lib/full-pages";
import { DISPLAY_NAME_MAX } from "@/lib/inputs";
import { DEFAULT_PRIVACY } from "@/lib/model";
import {
  deleteEverythingAction,
  disconnectAction,
  leave,
  renameSelfAction,
  syncNowAction,
  togglePrivacy,
} from "@/server/actions";
import { readDemoPrefs } from "@/server/leagues";
import { myAccounts } from "@/server/me";
import { currentUser } from "@/server/session";
import { syncStatus } from "@/server/status";
import { requireViewer } from "@/server/viewer";

export const metadata: Metadata = { title: "Settings" };

const NOTICES: Record<string, string> = {
  renamed: "Your name is updated everywhere friends see it.",
  name: "A name needs at least one letter or number.",
  "sync-synced": "Synced. Your numbers are up to date.",
  "sync-busy": "A sync ran a moment ago. Give it a minute and try again.",
  "sync-running":
    "A sync is still running. Your numbers update when it finishes, usually within a minute.",
  "sync-reconnect":
    "SnapTrade needs you to sign in again before Holdfast can read your accounts.",
  "sync-failed": "The sync did not finish. Please try again in a minute.",
  disconnected:
    "SnapTrade is disconnected. Your rank is paused until you sign in again.",
  "disconnected-check":
    "Your tokens are deleted and your rank is paused. SnapTrade did not confirm that access was revoked, so please also remove Holdfast in your SnapTrade settings.",
};

export default async function SettingsRoute({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const viewer = await requireViewer();
  const notice = pickNotice(NOTICES, (await searchParams).notice);
  const isUser = viewer.kind === "user";
  const user = isUser ? await currentUser() : null;
  const prefs = isUser ? null : await readDemoPrefs();
  const privacy = {
    showReturn:
      user?.showReturn ?? prefs?.showReturn ?? DEFAULT_PRIVACY.showReturn,
    showBadges:
      user?.showBadges ?? prefs?.showBadges ?? DEFAULT_PRIVACY.showBadges,
    showHoldings:
      user?.showHoldings ?? prefs?.showHoldings ?? DEFAULT_PRIVACY.showHoldings,
  };
  const lines = (await myAccounts(viewer)).map(accountLine);
  const status = await syncStatus(viewer);
  const needsReconnect = Boolean(user?.pausedSince);
  const back = { back: "/settings" };

  return (
    <>
      <Header
        active={null}
        initial={viewer.name.charAt(0).toUpperCase()}
        status={status}
      />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-5 pt-3 pb-28 lg:gap-10 lg:px-10 lg:pt-6 lg:pb-10">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="flex min-w-0 flex-col gap-1 lg:gap-3">
            <span className="label">Settings</span>
            {isUser ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 [&::-webkit-details-marker]:hidden">
                  <h1 className="m-0 min-w-0 text-[28px] leading-[1.05] font-medium tracking-[-0.035em] break-words lg:text-[40px]">
                    {viewer.name}
                  </h1>
                  <span
                    className="hover-text flex size-11 flex-none items-center justify-center text-dim"
                    role="img"
                    aria-label="Change display name"
                  >
                    <span className="group-open:hidden">
                      <Icon name="edit" size={17} />
                    </span>
                    <span className="hidden group-open:inline">
                      <Icon name="close" size={17} />
                    </span>
                  </span>
                </summary>
                <form
                  action={renameSelfAction}
                  className="hf-rise flex max-w-[520px] flex-wrap gap-3 pt-3"
                >
                  <label htmlFor="display-name" className="sr-only">
                    Display name
                  </label>
                  <input
                    id="display-name"
                    name="name"
                    required
                    maxLength={DISPLAY_NAME_MAX}
                    defaultValue={viewer.name}
                    autoComplete="nickname"
                    className={field}
                  />
                  <button type="submit" className={solid}>
                    Save name
                  </button>
                </form>
              </details>
            ) : (
              <h1 className="m-0 text-[28px] leading-[1.05] font-medium tracking-[-0.035em] lg:text-[40px]">
                Demo visitor
              </h1>
            )}
            <span className="text-dim">
              {isUser
                ? "The name friends see in leagues and on share cards."
                : "The demo stores nothing about you. Your switches live in a cookie on this device."}
            </span>
          </div>
          <form action={leave}>
            <button type="submit" className={outline}>
              <Icon name="out" size={15} />
              {isUser ? "Sign out" : "Exit the demo"}
            </button>
          </form>
        </div>
        <Notice>{notice}</Notice>
        {user?.lastSyncError && !needsReconnect && (
          <Notice>
            The last sync stopped short: {user.lastSyncError}
          </Notice>
        )}
        {needsReconnect && (
          <Notice>
            Your brokerage link dropped, so your rank is paused.{" "}
            <a
              href="/api/auth/start?next=/settings"
              className="text-text underline decoration-rule underline-offset-4"
            >
              Reconnect with SnapTrade
            </a>
          </Notice>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] items-start gap-x-14 gap-y-11">
          <section className="flex flex-col gap-2.5">
            <SectionHead title="Linked accounts" aside={status} />
            {lines.length === 0 ? (
              <p className="m-0 border-t border-b border-faint py-3 text-dim">
                No accounts yet. They appear here after your first sync with
                SnapTrade.
              </p>
            ) : (
              <div className="border-b border-faint">
                <AccountRows accounts={lines} back="/settings" />
              </div>
            )}
            {isUser && (
              <div className="flex flex-wrap items-center justify-between gap-x-6">
                <a
                  href="https://dashboard.snaptrade.com"
                  target="_blank"
                  rel="noreferrer"
                  className={quiet}
                >
                  <Icon name="plus" size={15} />
                  Link another brokerage
                </a>
                <form action={syncNowAction}>
                  <input type="hidden" name="back" value="/settings" />
                  <button type="submit" className={quiet}>
                    <Icon name="sync" size={15} />
                    Sync now
                  </button>
                </form>
              </div>
            )}
          </section>
          <section className="flex flex-col gap-2.5">
            <SectionHead title="Friends can see" aside="Never dollar amounts" />
            <div className="border-b border-faint">
              <Switch
                label="Return history"
                hint="Past quarters on your profile. Standings always show this quarter."
                on={privacy.showReturn}
                action={togglePrivacy}
                fields={{ field: "showReturn", ...back }}
              />
              <Switch
                label="Badges and habits"
                hint="What you have earned, with dates."
                on={privacy.showBadges}
                action={togglePrivacy}
                fields={{ field: "showBadges", ...back }}
              />
              <Switch
                label="Best and worst holding"
                hint="Ticker and percentage only."
                on={privacy.showHoldings}
                action={togglePrivacy}
                fields={{ field: "showHoldings", ...back }}
              />
            </div>
            <Link href="/profile" className={quiet}>
              Open your profile
              <Icon name="arrow" size={15} />
            </Link>
          </section>
          <section className="flex flex-col gap-2.5" id="data">
            <SectionHead
              title="Your data"
              aside={
                <>
                  <Icon name="lock" size={12} />
                  Read-only access
                </>
              }
            />
            <div className="flex flex-col border-b border-faint">
              <p className="m-0 border-t border-faint py-3 text-dim">
                {isUser
                  ? "Holdfast keeps a daily percentage return per account, your habits as dates and tickers, and your badges. Balances are kept for ten days, then deleted."
                  : "The demo's rivals are made up and nothing about you is stored on Holdfast's side."}
              </p>
              {isUser ? (
                <>
                  <ConfirmRow
                    title="Disconnect SnapTrade"
                    hint="Revokes access. Your history stays and your rank shows as paused."
                    open="Disconnect"
                  >
                    <form action={disconnectAction}>
                      <button type="submit" className={outline}>
                        Disconnect and pause my rank
                      </button>
                    </form>
                  </ConfirmRow>
                  <ConfirmRow
                    title="Delete everything"
                    hint="Leaves every league and deletes all of your data. This cannot be undone."
                    open="Delete"
                  >
                    <form
                      action={deleteEverythingAction}
                      className="flex flex-col items-start gap-2.5"
                    >
                      <span className="text-[13px] text-dim">
                        Revokes SnapTrade access and deletes your returns,
                        habits, badges and balances. Share cards you already
                        sent keep working. They hold a first name and
                        percentages only.
                      </span>
                      <button type="submit" className={outline}>
                        Delete all my data
                      </button>
                    </form>
                  </ConfirmRow>
                </>
              ) : (
                <ActionRow
                  title="Play for real"
                  hint="Sign in with SnapTrade to link accounts. Access is read-only."
                >
                  <a href="/api/auth/start" className={outline}>
                    Continue
                  </a>
                </ActionRow>
              )}
            </div>
            <Link href="/how-it-works" className={quiet}>
              How scoring and privacy work
              <Icon name="arrow" size={15} />
            </Link>
          </section>
        </div>
      </main>
      <TabBar active={null} />
    </>
  );
}
