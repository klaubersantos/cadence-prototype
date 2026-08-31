# Cadence — real implementation

A Next.js + PostgreSQL implementation of the [cadence-prototype](../README.md) music-lesson-studio
billing app. The business rules in `lib/engine/*.ts` are a faithful TypeScript port of the
prototype's `js/engine.js` — see `../traceability.html` for the requirement anchors each rule
satisfies.

## Stack

- Next.js 16 (App Router) + TypeScript, Server Actions for every mutation
- PostgreSQL + Prisma 7 (driver adapter, no Rust engine)
- Auth.js v5 (Credentials provider, JWT sessions) — real login for the teacher; a student sets
  a password the first time they open their invitation link
- Payments are **simulated** (no Stripe call) and email is **recorded, not sent** — see the plan's
  "Target stack" notes for why

## First-time setup

```bash
npm install
docker compose up -d        # starts Postgres on localhost:5432
npm run db:migrate          # applies prisma/migrations
npm run db:seed             # seeds a teacher, three students, lessons and invoices
npm run dev
```

Seed credentials (printed again at the end of `npm run db:seed`):

| Who | Email | Password |
|---|---|---|
| Teacher | teacher@studio.dev | teacher123 |
| Ava (active student) | ava.thompson@example.com | student123 |
| Noor (active student, monthly billing) | noor.haddad@example.com | student123 |
| Ben (pending invite) | — | visit `/invite/<token>` printed by the seed script |

## Scope

This is the MVP slice: the full data model and rules engine are ported, with screens for the
teacher dashboard, students (list/detail/add), unbilled lessons, invoices (list/detail/create),
and the full student portal. Calendar/week view, recurring-series creation & revision UI, notes
UI, PDF snapshot history UI, the email-activity screen, the portal access-log screen, and settings
are intentionally deferred — see the plan doc for the full list. The engine code for most of these
already exists in `lib/engine/`; only their screens are missing.

## Tests

```bash
npm test
```

Vitest integration tests in `tests/engine/*.test.ts` run against the same dev database
(`DATABASE_URL`) — make sure `docker compose up -d` and `npm run db:migrate` have run first.
