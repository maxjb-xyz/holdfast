/**
 * The name an account goes by in Holdfast, shown only to its owner.
 * Built from what the brokerage reports, in order of how telling it is:
 * the brokerage, the account's own name or type, and the last four
 * characters of its number so two alike accounts can be told apart.
 */
export function accountLabel(account: {
  institution: string | null;
  name: string | null;
  rawType: string | null;
  lastFour: string | null;
}): string {
  const institution = clean(account.institution);
  const name = clean(account.name) || clean(account.rawType);
  const parts: string[] = [];
  // "Robinhood" in front of "Robinhood Individual" would say it twice.
  if (institution && !hasWord(name, institution)) {
    parts.push(institution);
  }
  if (name) parts.push(name);
  if (parts.length === 0) parts.push("Account");
  const lastFour = clean(account.lastFour);
  const text = parts.join(" ").slice(0, 52).trim();
  return lastFour && !text.includes(lastFour) ? `${text} ··${lastFour}` : text;
}

const clean = (value: string | null): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

/** Whether `text` contains `word` as whole words, ignoring case. */
function hasWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
}
