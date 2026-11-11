# Holdfast

A quarterly league for long-term investors. Friends compete on percentage
return and steady habits, and nobody ever sees a dollar amount. Built on the
SnapTrade OAuth API with read-only access.

## What it does

- **Leagues.** Make a league, invite up to seven friends by link, and watch a
  live leaderboard for the calendar quarter. Each member chooses which of
  their linked accounts count.
- **Fair scoring.** Scores are the quarter's return with deposits and
  withdrawals taken out, so adding money cannot move a score. Late joiners
  start at 0% on the day they join.
- **Badges for patience.** One Year Hold, Never Missed a Month, Dividend
  Collector and Well Spread.
- **Quarterly Wrapped.** Six cards when a quarter ends, with a share card that
  shows percentages only.
- **Honest data.** Incomplete days are labelled partial instead of guessed. A
  dropped brokerage link pauses a rank instead of zeroing it.
- **A demo league.** Anyone can explore with made-up rivals before signing in.
- **Your data.** Leave a league, disconnect SnapTrade, or delete everything in
  one step.

## How it is built

- Next.js (App Router, TypeScript, Tailwind) on Cloudflare Workers via OpenNext
- Cloudflare D1 (SQLite) with Drizzle ORM
- Vitest for unit tests

Every screen is derived by pure functions in `src/lib` from one shape, a
`League` of `Player`s. The demo league is generated from a seed and stores
nothing. Real leagues are loaded from D1 into the same shape, so the demo and
the real thing run through identical scoring, feed and Wrapped code.

| Where | What |
| --- | --- |
| `src/lib/scoring.ts` | Daily returns with flows removed, chaining, ranking, ties |
| `src/lib/sync-math.ts`, `src/lib/sync-plan.ts` | Turns what a brokerage reports into what is stored |
| `src/lib/badges.ts`, `src/lib/pages.ts` | Badges, activity feed, profile and Wrapped models |
| `src/server/snaptrade/` | OAuth (PKCE, ID token checks), token refresh, API client |
| `src/server/sync.ts` | The sync job |
| `worker.ts` | Worker entry: the app, plus the nightly cron |

### SnapTrade

- Authorization code flow with PKCE, scopes `openid profile read`. The `trade`
  scope is never requested, and a token that carries it is refused.
- The client secret and all tokens stay on the server. Tokens are encrypted
  with AES-256-GCM before they are stored, bound to the user they belong to.
- The ID token's signature, issuer, audience, expiry and nonce are checked
  against SnapTrade's published keys.
- Refresh tokens rotate on every use. A refresh is claimed in the database
  first so two requests never spend the same token, and the new pair is saved
  before anything else happens.
- On a 401 the token is refreshed once and the call retried once. If that
  fails the person is asked to reconnect and their rank shows as paused.

### What is stored

Percentages, dates and tickers: a daily return per account, each account's
share of the day's money, habit facts, and badges. Account balances are the
only dollar amounts kept. They live in a ten-day window so a deposit the
brokerage reports late can be corrected, and are deleted after that. If a
link drops, the last balance waits until the account is reconnected.

### Sync

Accounts sync nightly at 23:30 UTC through a Worker cron, and in the
background when someone opens the app with numbers more than an hour old.
The first score appears the day after sign-in, because a return needs two
days of balances.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in when SnapTrade credentials exist
npm run db:migrate:local         # creates the local D1 database
npm run dev                      # http://localhost:3000
```

Without SnapTrade credentials the demo league still works end to end.
`npm run preview` builds the app and runs it on the real Workers runtime.

## Checks

```bash
npm run lint
npm run typecheck
npm test
```

## Database

The schema lives in `src/db/schema.ts`. After changing it, run
`npm run db:generate` to write a new migration into `drizzle/`, then
`npm run db:migrate:local`.

## Deploying

Pushes to `main` deploy through GitHub Actions once the repository has two
secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The workflow
creates the D1 database on first run, applies migrations, and deploys the
Worker.

Then set the app's secrets once with `npx wrangler secret put NAME`:

| Name | Value |
| --- | --- |
| `APP_URL` | The deployed address, such as `https://holdfast.example.workers.dev` |
| `SNAPTRADE_CLIENT_ID` | From the SnapTrade OAuth app |
| `SNAPTRADE_CLIENT_SECRET` | From the SnapTrade OAuth app |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` |

Register `<APP_URL>/api/auth/callback` as the redirect URI on the SnapTrade
OAuth app. It has to match exactly. Until these are set, "Continue with
SnapTrade" explains that sign-in is not set up and the demo stays open.

## Known limits

- SnapTrade Test apps hold five users.
- Scores are kept per UTC day.
- One Year Hold counts a holding from its opening trade when the brokerage's
  history shows it. Otherwise it counts from the earliest transaction the
  brokerage reports or the day Holdfast first saw the holding, whichever is
  earlier. It never assumes a holding is older than the evidence.
