# Yousra Stock — Backend

Internal ERP/stock management API for Yousra Company. Node.js + TypeScript +
Express, on Prisma Next (Postgres/Supabase). See
`src/CLAUDE_CODE_BRIEF_yousra_stock.md` for the full build brief and
`src/yousra-stock-erd-reference.md` for the data model.

## Setup

Secrets are managed through [Doppler](https://doppler.com) — there is no
committed `.env`. `.env.example` documents what's expected.

```bash
doppler setup          # links this folder to the yousra-stock / dev config, if not already
npm install
```

Required secrets (`doppler secrets set NAME=value`, or via the Doppler dashboard):

- `DATABASE_URL` — Postgres/Supabase connection string.
- `JWT_SECRET` — long random string for signing auth tokens.
- `PORT` — optional, defaults to `8000`.

## First-time database setup

```bash
doppler run -- npx prisma contract emit     # regenerate contract.json/contract.d.ts after any contract.prisma edit
doppler run -- npx prisma migration plan --name <slug>   # after a contract change, plan a migration
doppler run -- npx prisma db migrate        # apply pending migrations
```

The full first migration (`migrations/app/20260831T0456_init_schema/`) is
already planned and committed — running `db migrate` applies it.

**Supabase note:** this project connects via a plain, direct Postgres
connection (not the Supabase RLS/role-bound extension — no `auth.uid()` /
`asUser()` / policies anywhere here; tenant isolation is entirely
application-level `companyId` scoping in each service). Supabase projects
run an event trigger (`ensure_rls`) that force-enables Row Level Security
on every newly created table regardless of how it's created. Every model
in `contract.prisma` therefore carries `@@rls` with no policies (RLS on,
deny-all) purely so the contract matches what Supabase actually enforces —
without it, `prisma db migrate`'s post-apply schema verification fails and
rolls the whole migration back. This is harmless for the app: the
connection role (`postgres.<project-ref>`) has `rolbypassrls = true`, so
none of our own queries are ever filtered by RLS.

## Run

```bash
npm run dev     # tsx watch, via doppler run
npm start       # tsx, no watch
```

API is served under `/api/v1`. Swagger UI: `http://localhost:8000/api/v1/docs`.
Health check (no DB dependency): `GET /health`.

## Test

```bash
npm test          # vitest run, via doppler run
npm run test:watch
npm run typecheck  # tsc over src/ + test/
```

Tests are integration tests that drive the real Express app (via
`supertest`) against the real configured database — there is no test-DB
isolation or fixture reset yet. Each test creates its own company/tenant
with unique emails, so re-running the suite is safe, but it does leave
real rows behind (including global `Unit` reference-data rows, since units
aren't tenant-scoped).

## Auth / bootstrapping

`POST /companies` is the only way to create a tenant — it creates the
`Company` row and its first (`Admin`) user in one transaction and returns a
ready-to-use JWT. `POST /auth/user` (protected) adds further teammates to
the caller's own company. See the brief for the full reasoning.

## Known open items

- `DELETE /companies/:id` is not implemented — the finalized contract has
  no `deletedAt` on `Company`, unlike every other reference table. Needs a
  decision: add soft delete to `Company`, or accept it stays undeletable.
- Warehouse transfers (`WarehouseTransfer` / `WarehouseTransferItem`) exist
  in the schema but have no API surface yet — explicitly V2 per the
  contract's own comment.
- `StockMovement.type = ADJUSTMENT` has no persisted direction column;
  `POST /stock-movements` accepts a request-only `direction` field
  (`increase` / `decrease`) to decide the `StockLevel` delta, since the
  contract comment describes a signed correction but the schema doesn't
  carry a sign. Flagging in case a different convention was intended.
- **Known concurrency races — not yet fixed, deliberately.** Three spots
  read a value, then write based on it, without a row lock. At the traffic
  a small internal tool sees this is unlikely to bite, but it's real and
  worth knowing about before scaling up concurrent writers:
  - `stock.service.ts` (`recordStockMovement`) reads `StockLevel.quantity`,
    computes the new value in JS, and writes it back. Two simultaneous
    movements against the same `(item, warehouse)` can race and one
    decrement can get lost.
  - `goods-receipt.service.ts` (`createGoodsReceipt`) computes whether a
    `PurchaseOrder` is now fully received from a read taken before its own
    transaction. Two simultaneous partial receipts against the same PO can
    both see "not yet fully received" and leave the PO stuck at
    `PARTIALLY_RECEIVED` after both commit.
  - `nomenclature.service.ts` (`createNomenclature`) computes the next BOM
    `version` via `MAX(version) + 1` outside the insert's transaction. Two
    simultaneous creates for the same `itemId` can compute the same
    version; the DB's `@@unique([itemId, version])` catches it and the
    caller gets a clean `409` (fixed — see below), but the *loser* still
    has to retry rather than just succeeding at version N+1.
  - The real fix for all three is a row lock (`SELECT ... FOR UPDATE`) or
    an atomic SQL-level increment before the read; deliberately not
    attempting that under time pressure with no concurrent-load test
    harness to verify it — a wrong locking fix is worse than a documented
    gap.
- **Tenant scoping via unbounded id-fetch.** `PurchaseOrder`, `GoodsReceipt`,
  `Invoice`, `StockLevel`, and `StockMovement` have no `companyId` of their
  own, so their list endpoints scope to the tenant by first fetching *every*
  `Supplier`/`Warehouse` id for the company into memory, then filtering with
  `.in(ids)`. Fine at the scale of one internal company's supplier/warehouse
  list; would need revisiting (e.g. adding `companyId` directly to those
  tables) if that ever grows into the thousands.

## Notable bugs fixed during initial build (kept here for context)

- **`req.query` under Express 5.** Express 5 made `req.query` a getter that
  re-parses the raw URL string on every access (no stable object to
  mutate). `validateQuery` originally tried `req.query = parsed`, which
  throws (`Cannot set property query of #<IncomingMessage>`) on every list
  endpoint. Fixed by stashing the parsed/coerced query on
  `req.validatedQuery` instead (see `shared/validate.ts`).
- **Invoice numbers colliding.** The auto-generated invoice number sliced
  the first 8 hex chars of the `GoodsReceipt` id for "uniqueness" — but
  `id` is a UUIDv7, whose leading bits are a millisecond timestamp, not
  random, so two receipts created close together in time produced the same
  prefix and hit `invoice_invoiceNumber_key`. Fixed by using the full id
  (`INV-<full-uuid>`), which is unique by construction.
- **Privilege escalation via `POST /auth/user`.** Any authenticated user —
  including `Staff` — could create a new teammate with `role: "Admin"` and
  log in as them, since the request body's `role` was trusted as-is. Fixed
  by requiring the caller to already be an `Admin` to hit this endpoint at
  all (see `auth.controller.ts`); covered by a regression test.
- **Soft-deleted `Nomenclature` rows stayed fully live.** Unlike every other
  soft-deletable model, `getNomenclatureById`/`listNomenclature` never
  filtered `deletedAt IS NULL` — a deleted BOM draft could still be read,
  PATCHed, or referenced by a new stock movement. Fixed by adding the
  filter (now consistent with every other module).
- **Invoice `amount` floating-point noise.** Summing `unitCost * quantity`
  in plain JS numbers (even though both are exact decimal strings) can
  produce values like `0.30000000000000004` in a money field. Fixed by
  rounding to 2 decimal places per line and again after the sum.
