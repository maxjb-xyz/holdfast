import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Liveness check that also confirms the D1 binding answers. */
export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  try {
    await env.DB.prepare("select 1").first();
    return Response.json({ ok: true, db: "ok" });
  } catch {
    return Response.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
