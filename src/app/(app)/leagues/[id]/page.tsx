import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fact, Header, SectionHead, TabBar } from "@/components/chrome";
import { CopyLink } from "@/components/copy-link";
import { Icon } from "@/components/icons";
import {
  ActionRow,
  ConfirmRow,
  Crumb,
  Notice,
  Segments,
  field,
  outline,
  solid,
} from "@/components/ui";
import { plural, quarterLabel, shortDate, signedPercent } from "@/lib/format";
import { LEAGUE_NAME_MAX } from "@/lib/inputs";
import { MAX_LEAGUE_MEMBERS } from "@/lib/model";
import { leaguePage } from "@/lib/pages";
import { nextQuarter, quarterOf, quartersEndingAt } from "@/lib/quarters";
import {
  deleteLeagueAction,
  leaveLeagueAction,
  removeMemberAction,
  renameLeagueAction,
  resetInviteAction,
  transferLeagueAction,
} from "@/server/actions";
import { leagueAdmin } from "@/server/league-admin";
import { loadLeague } from "@/server/leagues";
import { siteOrigin } from "@/server/me";
import { syncStatus } from "@/server/status";
import { requireViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Manage league" };

const NOTICES: Record<string, string> = {
  created: "League made. Send the invite link to your friends.",
  renamed: "The league has its new name.",
  reset: "The invite link is new. The old one no longer works.",
  removed: "They are out of the league. Their own scores and badges stay with them.",
  "handed-over": "The league has a new owner.",
  name: "Give the league a name first.",
  "not-owner": "Only the league's owner can do that.",
  "not-member": "That person is not in this league.",
};

const MEMBER_COLS =
  "grid grid-cols-[minmax(0,1fr)_64px_auto] items-center gap-x-4 lg:grid-cols-[minmax(0,1fr)_90px_80px_84px] lg:gap-x-6";

const withYear = (date: string) => `${shortDate(date)}, ${date.slice(0, 4)}`;

export default async function ManageLeagueRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id } = await params;
  const viewer = await requireViewer();
  if (viewer.kind !== "user") notFound();
  const [admin, league] = await Promise.all([
    leagueAdmin(viewer.id, id),
    loadLeague(viewer, id),
  ]);
  if (!admin || !league) notFound();
  const notice = NOTICES[(await searchParams).notice ?? ""];
  const day = today();
  const quarter = quarterOf(day);
  const page = leaguePage(league, viewer.id, day);
  const score = new Map(page.rows.map((r) => [r.userId, r.score.value]));
  const open = MAX_LEAGUE_MEMBERS - admin.members.length;
  const others = admin.members.filter((m) => m.userId !== viewer.id);
  const owner = admin.members.find((m) => m.userId === admin.ownerId);
  const startOn = (league as { startOn?: string | null }).startOn ?? null;
  const pastQuarters = quartersEndingAt(quarter, 4)
    .slice(0, -1)
    .filter((q) => q.end >= admin.createdOn).length;
  const hidden = <input type="hidden" name="leagueId" value={admin.id} />;

  return (
    <>
      <Header
        active="League"
        initial={viewer.name.charAt(0).toUpperCase()}
        status={await syncStatus(viewer)}
      />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-wrap items-start gap-x-[72px] gap-y-12 px-5 pt-3 pb-28 lg:px-10 lg:pt-6 lg:pb-10">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-10">
          <div className="flex flex-col gap-3">
            <Crumb
              href="/leagues"
              parent="Leagues"
              here={admin.isOwner ? "Manage" : "Details"}
            />
            {admin.isOwner ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 [&::-webkit-details-marker]:hidden">
                  <h1 className="serif m-0 min-w-0 text-[28px] leading-[1.05] break-words lg:text-[40px]">
                    {admin.name}
                  </h1>
                  <span
                    className="hover-text flex size-11 flex-none items-center justify-center text-dim"
                    aria-label="Rename league"
                    role="img"
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
                  action={renameLeagueAction}
                  className="hf-rise flex max-w-[520px] flex-wrap gap-3 pt-3"
                >
                  {hidden}
                  <label htmlFor="league-name" className="sr-only">
                    New league name
                  </label>
                  <input
                    id="league-name"
                    name="name"
                    required
                    maxLength={LEAGUE_NAME_MAX}
                    defaultValue={admin.name}
                    autoComplete="off"
                    className={field}
                  />
                  <button type="submit" className={solid}>
                    Save name
                  </button>
                </form>
              </details>
            ) : (
              <h1 className="serif m-0 text-[28px] leading-[1.05] break-words lg:text-[40px]">
                {admin.name}
              </h1>
            )}
            <span className="text-dim">
              {admin.isOwner
                ? `You started this league on ${withYear(admin.createdOn)}.`
                : `Started on ${withYear(admin.createdOn)}${owner ? ` and run by ${owner.name}` : ""}.`}
            </span>
            <Link
              href={`/league?league=${admin.id}`}
              className="hover-text flex min-h-11 items-center gap-2 self-start"
            >
              Open the league
              <Icon name="arrow" size={15} />
            </Link>
          </div>
          <Notice>{notice}</Notice>
          <div className="flex flex-col gap-2.5">
            <div className={`${MEMBER_COLS} label`}>
              <span>
                Members · {admin.members.length} of {MAX_LEAGUE_MEMBERS}
              </span>
              <span className="hidden !text-grey lg:block">Joined</span>
              <span className="text-right !text-grey">Quarter</span>
              <span />
            </div>
            <ul className="m-0 list-none border-b border-faint p-0">
              {admin.members.map((m, i) => {
                const you = m.userId === viewer.id;
                const value = score.get(m.userId) ?? null;
                const isOwner = m.userId === admin.ownerId;
                return (
                  <li
                    key={m.userId}
                    className="hf-row border-t border-faint"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <div className={`${MEMBER_COLS} min-h-14`}>
                      <span className="flex min-w-0 flex-col leading-[1.35]">
                        <Link
                          href={
                            you
                              ? "/profile"
                              : `/profile/${encodeURIComponent(m.userId)}?league=${admin.id}`
                          }
                          className={`hover-text truncate text-[15px] font-medium ${you ? "text-you" : ""}`}
                        >
                          {m.name}
                        </Link>
                        <span className="text-xs text-grey">
                          {[you ? "You" : null, isOwner ? "Owner" : "Member"]
                            .filter(Boolean)
                            .join(" · ")}
                          <span className="lg:hidden">
                            {" "}
                            · Joined {shortDate(m.joinedOn)}
                          </span>
                        </span>
                      </span>
                      <span className="hidden font-mono text-xs text-dim lg:block">
                        {shortDate(m.joinedOn)}
                      </span>
                      <span
                        className={`text-right font-mono text-[13px] ${you ? "text-you" : "text-sub"}`}
                      >
                        {value === null ? "–" : signedPercent(value)}
                      </span>
                      {admin.isOwner && !you ? (
                        <details className="group relative justify-self-end">
                          <summary className="hover-text flex min-h-11 cursor-pointer list-none items-center text-[13px] text-dim [&::-webkit-details-marker]:hidden">
                            <span className="group-open:hidden">Remove</span>
                            <span className="hidden group-open:inline">Cancel</span>
                          </summary>
                          <form
                            action={removeMemberAction}
                            className="hf-rise absolute top-full right-0 z-10 flex w-[260px] flex-col gap-2.5 border border-rule bg-raised p-3.5"
                          >
                            {hidden}
                            <input type="hidden" name="userId" value={m.userId} />
                            <span className="text-[13px] text-dim">
                              {m.name} stops being scored here. They can rejoin
                              with a fresh invite.
                            </span>
                            <button type="submit" className={`${outline} self-start`}>
                              Remove {m.name.split(" ")[0]}
                            </button>
                          </form>
                        </details>
                      ) : (
                        <span />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="m-0 text-xs text-grey">
              {admin.isOwner
                ? "Removing someone stops their score here. Their own history and badges stay with them."
                : "Only the owner can rename the league or remove members."}
            </p>
          </div>
        </section>
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-10 lg:pt-7">
          <section className="flex flex-col gap-2.5">
            <SectionHead
              title="Invite"
              aside={open > 0 ? `${plural(open, "place")} open` : "Full"}
            />
            <div className="flex flex-col border-b border-faint">
              <div className="flex flex-col gap-2.5 border-t border-faint py-3.5">
                <Segments done={admin.members.length} of={MAX_LEAGUE_MEMBERS} />
                {open > 0 ? (
                  <CopyLink url={`${await siteOrigin()}/join/${admin.inviteCode}`} />
                ) : (
                  <span className="text-dim">
                    This league is full, so its invite link is closed.
                  </span>
                )}
              </div>
              {admin.isOwner && (
                <ConfirmRow
                  title="Reset the link"
                  hint="The old link stops working. Current members stay."
                  open="Reset"
                >
                  <form action={resetInviteAction}>
                    {hidden}
                    <button type="submit" className={outline}>
                      Make a new link
                    </button>
                  </form>
                </ConfirmRow>
              )}
            </div>
          </section>
          <section className="flex flex-col gap-2.5">
            <SectionHead title="This quarter" aside={quarterLabel(quarter.key)} />
            <div className="flex flex-col border-b border-faint">
              <Fact
                label="Scoring started"
                value={withYear(
                  startOn && startOn > quarter.start
                    ? startOn
                    : admin.createdOn > quarter.start && !startOn
                      ? admin.createdOn
                      : quarter.start,
                )}
              />
              <Fact label="Resets" value={withYear(nextQuarter(quarter).start)} />
              <Fact
                label="Past quarters"
                value={pastQuarters === 0 ? "None yet" : String(pastQuarters)}
                quiet={pastQuarters === 0}
              />
            </div>
          </section>
          <section className="flex flex-col gap-2.5">
            <SectionHead title={admin.isOwner ? "Ownership" : "Membership"} />
            <div className="flex flex-col border-b border-faint">
              {admin.isOwner && others.length > 0 && (
                <ConfirmRow
                  title="Hand the league over"
                  hint="Pick a member to become the owner."
                  open="Choose"
                >
                  <form
                    action={transferLeagueAction}
                    className="flex flex-wrap items-center gap-3"
                  >
                    {hidden}
                    <label htmlFor="new-owner" className="sr-only">
                      New owner
                    </label>
                    <select
                      id="new-owner"
                      name="userId"
                      required
                      className={`${field} appearance-none [color-scheme:dark]`}
                    >
                      {others.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={outline}>
                      Hand over
                    </button>
                  </form>
                </ConfirmRow>
              )}
              <ConfirmRow
                title="Leave"
                hint={
                  admin.members.length === 1
                    ? "You are the only member, so the league is removed."
                    : admin.isOwner
                      ? "The league passes to its longest-standing member."
                      : "Your score here stops. Rejoining starts you again from that day."
                }
                open="Leave"
              >
                <form action={leaveLeagueAction}>
                  {hidden}
                  <button type="submit" className={outline}>
                    Leave {admin.name}
                  </button>
                </form>
              </ConfirmRow>
              {admin.isOwner && (
                <ConfirmRow
                  title="Delete the league"
                  hint={`Removes the league for ${admin.members.length === 1 ? "you" : `all ${admin.members.length} members`}. This cannot be undone.`}
                  open="Delete"
                >
                  <form action={deleteLeagueAction}>
                    {hidden}
                    <button type="submit" className={outline}>
                      Delete {admin.name} for everyone
                    </button>
                  </form>
                </ConfirmRow>
              )}
            </div>
          </section>
        </aside>
      </main>
      <TabBar active="League" />
    </>
  );
}
