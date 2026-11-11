# Holdfast

Compete with friends on how well and how patiently you invest, without ever
showing anyone your dollar amounts. Built on the SnapTrade OAuth API (read only).

## Stack

- Next.js (App Router, TypeScript, Tailwind) on Cloudflare Workers via OpenNext
- Cloudflare D1 (SQLite) with Drizzle ORM
- Vitest for unit tests

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in when SnapTrade credentials exist
npm run db:migrate:local         # creates the local D1 database
npm run dev                      # http://localhost:3000
```

`npm run preview` builds the app and runs it on the real Workers runtime locally.

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
Worker. App secrets are set once with `npx wrangler secret put NAME`
(names are listed in `.dev.vars.example`).
