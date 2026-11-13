import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/server/cron";
import { snaptradeConfig } from "@/server/env";
import { SYNC_BATCH, syncUser, usersToSync } from "@/server/sync";

/**
 * The nightly sync. Called by the Worker's scheduled handler, never by a
 * browser. Without `user` it hands each person to a fresh invocation of this
 * same route, so one slow brokerage never uses up another person's budget.
 * Page views use the `user` form too (see lazy-sync), so their sync runs as
 * a request of its own rather than in the page's short background time.
 */
/** A caller may ask for a longer gap since the last sync, up to an hour. */
function gapMs(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 60_000 ? Math.min(n, 3_600_000) : 60_000;
}

export async function POST(request: NextRequest) {
  const config = await snaptradeConfig();
  if (!config) return NextResponse.json({ ok: false }, { status: 503 });
  const authorization = request.headers.get("authorization");
  if (!(await isCronRequest(authorization, config.encryptionKey))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const userId = request.nextUrl.searchParams.get("user");
  if (userId) {
    try {
      return NextResponse.json({
        ok: true,
        result: await syncUser(userId, config, {
          minGapMs: gapMs(request.nextUrl.searchParams.get("gap")),
        }),
      });
    } catch (error) {
      console.error("sync failed", userId, error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  const { env } = await getCloudflareContext({ async: true });
  // `next dev` has no route back to this Worker, so it syncs in place.
  const self =
    process.env.NODE_ENV === "development"
      ? undefined
      : (env as unknown as { WORKER_SELF_REFERENCE?: Fetcher })
          .WORKER_SELF_REFERENCE;
  const ids = await usersToSync();
  const viaSelf = async (id: string, worker: Fetcher): Promise<void> => {
    const response = await worker.fetch(
      `https://holdfast.internal/api/cron/sync?user=${encodeURIComponent(id)}`,
      { method: "POST", headers: { authorization: authorization as string } },
    );
    if (!response.ok) throw new Error(`sync answered ${response.status}`);
  };
  const results = await Promise.allSettled(
    ids.map((id) =>
      self ? viaSelf(id, self) : syncUser(id, config).then(() => undefined),
    ),
  );
  for (const r of results) {
    if (r.status === "rejected") console.error("nightly sync failed", r.reason);
  }
  const failed = results.filter((r) => r.status === "rejected").length;
  // A full batch means more people may be waiting: hand the rest to a fresh
  // invocation. Everyone just tried is skipped for six hours, so this ends.
  const round = Number(request.nextUrl.searchParams.get("round") ?? "0");
  if (self && ids.length === SYNC_BATCH && round < 20) {
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(
      self
        .fetch(`https://holdfast.internal/api/cron/sync?round=${round + 1}`, {
          method: "POST",
          headers: { authorization: authorization as string },
        })
        .catch((error) => console.error("nightly sync hand-off failed", error)),
    );
  }
  return NextResponse.json(
    { ok: failed === 0, users: ids.length, failed },
    { status: failed === 0 ? 200 : 500 },
  );
}
