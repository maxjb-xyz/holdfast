/**
 * The Worker entry point. Requests go straight to the app that OpenNext
 * builds. The scheduled handler runs the nightly sync by calling the app's
 * own sync route.
 */

// @ts-ignore The build output has no types and exists only after a build.
import app from "./.open-next/worker.js";

type Env = {
  TOKEN_ENCRYPTION_KEY?: string;
  WORKER_SELF_REFERENCE: Fetcher;
};

async function cronSecret(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`holdfast-cron:${key}`),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const worker = {
  fetch: app.fetch,

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (!env.TOKEN_ENCRYPTION_KEY) return;
    const secret = await cronSecret(env.TOKEN_ENCRYPTION_KEY);
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch(
        "https://holdfast.internal/api/cron/sync",
        { method: "POST", headers: { authorization: `Bearer ${secret}` } },
      ).then((response) => {
        if (!response.ok) {
          console.error("nightly sync answered", response.status);
        }
      }),
    );
  },
} satisfies ExportedHandler<Env>;

export default worker;
