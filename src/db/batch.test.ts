import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { batchStatements } from "./batch";
import * as schema from "./schema";

/** A stand-in D1 client that records what would run. */
function fakeD1() {
  const ran: { sql: string; params: unknown[] }[][] = [];
  const client = {
    prepare: (query: string) => ({
      bind: (...params: unknown[]) => ({ sql: query, params }),
    }),
    batch: async (statements: { sql: string; params: unknown[] }[]) => {
      ran.push(statements);
      return statements.map(() => ({ results: [], success: true, meta: {} }));
    },
  };
  return { client: client as unknown as D1Database, ran };
}

describe("batchStatements", () => {
  it("runs raw statements with parameters next to query builders", async () => {
    const { client, ran } = fakeD1();
    const db = drizzle(client, { schema });
    const writes = [
      db
        .update(schema.users)
        .set({ lastSyncError: null })
        .where(sql`${schema.users.id} = ${"u1"}`),
      db.run(sql`insert into daily_returns (account_id) values (${"a1"})`),
    ];
    // Drizzle's own batch cannot run the raw statement.
    await expect(db.batch([writes[0], writes[1]] as never)).rejects.toThrow(
      /bind/,
    );
    await batchStatements(db, writes);
    expect(ran).toHaveLength(1);
    expect(ran[0][0].params).toEqual([null, "u1"]);
    expect(ran[0][1]).toEqual({
      sql: "insert into daily_returns (account_id) values (?)",
      params: ["a1"],
    });
  });
});
