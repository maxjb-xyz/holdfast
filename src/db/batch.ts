/** A drizzle query builder, or a raw `db.run(sql)` statement. */
type Statement = {
  toSQL?: () => { sql: string; params: unknown[] };
  getQuery?: () => { sql: string; params: unknown[] };
};

/**
 * Runs the statements as one D1 batch. Drizzle's own `db.batch` cannot take
 * a `db.run(sql)` statement that has parameters (it reads a prepared
 * statement the raw query does not have, and fails with "Cannot read
 * properties of undefined (reading 'bind')"), so each statement is turned
 * into its SQL and parameters and handed to D1 directly.
 */
export async function batchStatements(
  db: { $client: D1Database },
  statements: readonly Statement[],
): Promise<void> {
  if (statements.length === 0) return;
  const prepared = statements.map((statement) => {
    const query = statement.toSQL?.() ?? statement.getQuery?.();
    if (!query) throw new Error("A sync write could not be turned into SQL");
    return db.$client.prepare(query.sql).bind(...query.params);
  });
  await db.$client.batch(prepared);
}
