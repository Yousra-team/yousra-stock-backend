# Yousra Stock — Backend MVP Build Brief (for Claude Code)

## 0. Read this first

You are implementing the backend for **Yousra Stock**, an internal ERP/stock
management system for Yousra Company (Douala, Cameroon). This document is
the single source of truth for scope, schema, conventions, and open
questions. Chris (the developer you're working with) is the technical lead;
he reviews and understands every change before accepting it — do not do
silent, sweeping refactors. Explain design decisions when you make them.

If something in this brief is ambiguous or you have to guess (e.g. an enum
value not spelled out below), **stop and ask, or clearly flag the
assumption in your output** rather than silently picking one.

---

## 1. Stack (locked, do not deviate)

- **Runtime**: Node.js + TypeScript + Express
- **ORM**: Prisma (currently v7 — use `prisma migrate dev`, NOT `db push`) + `prisma.config.ts`
- **DB**: PostgreSQL (Supabase for this project)
- **Validation**: Zod, invoked at runtime via `safeParse` (never rely on
  TypeScript types on `req.body` alone — they're compile-time only)
- **Secrets**: Doppler CLI (`doppler run -- <command>`). No `.env` files
  committed. `doppler.yaml` is already present.
- **Auth**: JWT (see §5)
- **API docs**: swagger-jsdoc + swagger-ui-express

## 2. Architecture — Modular Monolith (locked)

One codebase, one deployment. Code is organized **by domain module**:

```
src/
  modules/
    auth/
    company/
    suppliers/
    catalog/           # items + categories
    warehouses/
    measurements/       # units
    nomenclature/        # BOM
    procurement/         # purchase orders, goods receipts, invoices
    stock/                # stock levels, stock movements
    integration/          # external systems / API keys
  shared/               # cross-cutting: middleware, errors, prisma client, zod helpers
  index.ts
```

**Hard rule**: Module A never queries Module B's Prisma tables directly.
Module A calls Module B's public `index.ts` interface (exported service
functions) if it needs data from another domain. This is the boundary that
keeps the monolith modular — do not violate it for convenience.

Each module folder should look like:
```
modules/<domain>/
  <domain>.routes.ts
  <domain>.controller.ts
  <domain>.service.ts       # business logic + all Prisma calls for this domain live here
  <domain>.schema.ts         # Zod schemas
  index.ts                   # public interface exported to other modules
```

## 3. Core conventions (locked — apply everywhere)

- **`companyId` is NEVER trusted from the client.** It is always derived
  server-side from the authenticated user's JWT/auth context
  (`req.user.companyId`). Never accept `companyId` in a request body, even
  if a client sends one — ignore it and use the server-derived value.
- **Soft delete** on all reference/catalog tables via a `deletedAt`
  (nullable `DateTime`) column. "Delete" endpoints set `deletedAt`, they
  never hard-delete. All list/get queries must filter `deletedAt: null` by
  default.
- **`prisma.$transaction()`** required for any multi-table write (e.g.
  creating a Purchase Order + its line items in one call).
- **Explicit conditional branching** (`if`/`else if`) preferred over clever
  dynamic dispatch — this is a stated code-style preference. Keep it
  readable and debuggable over "elegant."
- **Response envelope** (already established in Postman collection):
  - Success: `{ data, meta }` (meta used for pagination: `{ page, pageSize, total }`)
  - Error: `{ error: { message, code? } }`
- **Pagination**: all list endpoints accept `?page=1&pageSize=20` query
  params, default `page=1`, `pageSize=20`.
- **IDs**: use ULIDs (the Postman examples use `sup_...`, `itm_...`,
  `wh_...`, `unt_...`, `po_...`, `nom_...` prefixed ULID-style IDs). Confirm
  with Chris whether to implement prefixed IDs exactly like this or use
  plain Prisma `cuid()`/`uuid()` — **flag this as an open question, don't
  guess silently.**
- **Migrations**: always `prisma migrate dev` with a descriptive name.
  Never edit an already-applied migration file.
- **Safe migration pattern** for changing existing populated columns:
  Add → Backfill → Remove. Never directly drop/rename a populated column
  in one step.

## 4. Data model (from the finalized ERD — "Yousra Stock - Revised ERD v2")

Implement `schema.prisma` reflecting these decisions. This is not
exhaustive DDL — infer standard fields (id, timestamps, etc.) but confirm
field-level details that aren't specified here rather than guessing.

- **Company** — top-level tenant. Every other domain table has a
  `companyId` FK (server-derived, see §3).
- **Multi-tenancy**: this is a multi-tenant system scoped by `companyId`.
  Every query in every module must filter by the authenticated user's
  `companyId`.
- **User** — linked to Company. Fields seen in Register payload:
  `employeeId`, `firstName`, `lastName`, `role`, `email`, `phone`,
  `companyId`. Role is currently a free string (`"stock manager"` in the
  example) — confirm with Chris whether this should be a Prisma enum.
- **Supplier** — `name`, `country`, `city`, `address`, `phone`, `email`,
  `type` (enum, at least `COMPANY` seen — confirm full enum), soft delete.
- **Category** — `name`, soft delete, self-referential parent optional
  (confirm if nested categories are in scope for MVP — Postman doesn't show
  a `parentId` field, so treat as flat for MVP unless told otherwise).
- **Item** — `name`, `categoryId` (FK), `baseUnitId` (FK → Unit),
  `isStockable` (bool), `isBuyable` (bool), `reorderThreshold` (number),
  soft delete. **`warehouseId` does NOT belong on Item** — it belongs on
  StockLevel (explicit ERD decision).
- **Unit** — `name`, `symbol`, `family` (enum: `MASS`, `VOLUME`, `UNIT`),
  `factorToBase` (number), `isBase` (bool), soft delete. Conversion logic:
  `GET /measurements/units/convert?fromUnitId&toUnitId&quantity` — implement
  using `factorToBase` (convert to base unit, then to target unit); reject
  conversions across different `family` values.
- **Warehouse** — `name`, soft delete.
- **StockLevel** — composite around `(warehouseId, itemId)`, current
  quantity. `warehouseId` lives here, not on Item.
- **StockMovement** — `type` (enum — Postman only shows `CONSUMPTION`;
  **flag as open question**: likely also needs `RECEIPT`, `ADJUSTMENT`,
  `TRANSFER` at minimum to make the model coherent with Procurement — ask
  Chris rather than assuming the full set), `warehouseId`,
  `nomenclatureId` (nullable — only set for consumption-via-BOM movements),
  `quantity`, timestamps. This is the append-only ledger; StockLevel is the
  derived/cached current state.
- **Nomenclature (BOM)** — `itemId` (the "parent" produced item), `notes`,
  versioned with `NomenclatureLine` child records (`subItemId`, `quantity`,
  `unitId`). Has a **draft vs active** version concept: `POST
  /nomenclature/:id/activate` promotes a draft to active. Only one active
  version per `itemId` at a time — enforce this in the service layer.
- **PurchaseOrder** — `supplierId`, `warehouseId`, `expectedAt`, `status`
  (enum — seen value `SENT`; infer a reasonable lifecycle: `DRAFT` →
  `SENT` → `RECEIVED`/`PARTIALLY_RECEIVED` → `CANCELLED`, but **confirm
  with Chris**), line items (`itemId`, `quantity`, `unitCost`).
- **GoodsReceipt** — `purchaseOrderId`, `supplierId`, `warehouseId`,
  `receivedAt`, line items (`itemId`, `unitCost`, `quantity` received —
  may differ from ordered quantity, e.g. 95 received vs 100 ordered in the
  example). Recording a Goods Receipt should: (1) create the receipt +
  lines in a transaction, (2) increment the relevant StockLevel rows, (3)
  write corresponding StockMovement records, (4) update PurchaseOrder
  status if fully received.
- **Invoice** — tied to procurement (read-only endpoints only in MVP —
  no create/update shown in the collection, so implement list + get only
  unless Chris says otherwise).
- **ExternalSystem** (Integration module) — `name`, `description`,
  `phone`; supports API key issuance and rotation
  (`POST /integration/systems/:id/rotate-keys`) and revocation. This is for
  server-to-server auth from other systems (e.g. Pizzaland V2) calling into
  Yousra Stock — separate from the human-user JWT auth in §5.

The procurement chain is: **PurchaseOrder → GoodsReceipt → Invoice**
(explicit ERD decision — build in that order of dependency).

## 5. Authentication (in scope for this MVP pass)

Chris confirmed: **build minimal JWT auth** now, don't stub it out.

Implement:
- `POST /api/v1/auth/user` — register (already in Postman; wire to
  actually create a User + hash nothing sensitive yet since no password
  field appears in the current payload — **flag this explicitly**: the
  existing Register payload has no `password` field. Either (a) ask Chris
  whether to add a `password` field to this endpoint now, or (b) implement
  it as invite-only/passwordless for MVP and add a separate
  `POST /api/v1/auth/login` that issues a JWT via a different mechanism
  (e.g. magic-link style, matching the pattern already used in Pizzaland
  V2's WhatsApp magic-link auth) — **do not silently add a password field
  without confirming**, since it changes the existing contract.
- `POST /api/v1/auth/login` — not yet in the Postman collection; add it
  and a corresponding request to the collection once the mechanism above
  is confirmed.
- JWT middleware (`shared/middleware/requireAuth.ts`) that:
  - Verifies the token
  - Attaches `req.user = { id, companyId, role }`
  - Returns `401` on missing/invalid token
  - **Must be mounted before all protected routes.** Follow the same
    lesson already learned on this project: middleware ordering matters
    (e.g. `cookie-parser` must be mounted before routes that read
    cookies) — same principle applies here if the JWT is read from a
    cookie rather than an `Authorization` header. Prefer `Authorization:
    Bearer <token>` header for a stateless API unless Chris says otherwise.
  - Apply this middleware to every route except `POST /auth/user` and
    `POST /auth/login`.
- Role/permission enforcement beyond "is authenticated" is explicitly
  **out of scope** for this pass — Chris's notes say permissions/roles
  strategy is still being decided. Just get `companyId`-scoped auth
  working; don't build a full RBAC system yet.
- The separate **ExternalSystem / API key** mechanism in §4 (Integration
  module) is a different, service-to-service auth path — keep it
  independent of the human JWT middleware.

## 6. Full endpoint list (from the current Postman collection — build all of these)

Base path: `/api/v1`. Collection variable `baseUrl` = `http://localhost:8000` locally.

### Authentication
- `POST /auth/user` — register user (see §5 for the password/mechanism question)
- `POST /integration/system` — (duplicate-looking endpoint also under
  Integration below as `/integration/systems` — **flag this
  inconsistency to Chris**: singular `/system` in Authentication folder
  vs plural `/systems` in Integration folder; likely the Integration
  folder's plural version is canonical and this one is stale — confirm
  before implementing both)

### Company
- `POST /companies`
- `GET /companies?page&pageSize`
- `GET /companies/:id`
- `PATCH /companies/:id`
- `DELETE /companies/:id` (soft)

### Suppliers
- `POST /suppliers`
- `GET /suppliers?page&pageSize`
- `GET /suppliers/:id`
- `PATCH /suppliers/:id`
- `DELETE /suppliers/:id` (soft)

### Catalog — Items
- `POST /catalog/items`
- `GET /catalog/items?page&pageSize`
- `GET /catalog/items/:id`
- `PATCH /catalog/items/:id`
- `DELETE /catalog/items/:id` (soft)

### Catalog — Categories
- `POST /catalog/categories`
- `GET /catalog/categories?page&pageSize`
- `GET /catalog/categories/:id`
- `PATCH /catalog/categories/:id`
- `DELETE /catalog/categories/:id` (soft)

### Warehouses
- `POST /warehouses`
- `GET /warehouses?page&pageSize`
- `GET /warehouses/:id`
- `PATCH /warehouses/:id`
- `DELETE /warehouses/:id` (soft)

### Nomenclature (BOM)
- `POST /nomenclature`
- `GET /nomenclature?page&pageSize`
- `GET /nomenclature/:id`
- `PATCH /nomenclature/:id` (notes only)
- `POST /nomenclature/:id/activate`
- `DELETE /nomenclature/:id` (soft)

### Measurements — Units
- `POST /measurements/units`
- `GET /measurements/units?page&pageSize`
- `GET /measurements/units/:id`
- `PATCH /measurements/units/:id`
- `DELETE /measurements/units/:id` (soft)
- `GET /measurements/units/convert?fromUnitId&toUnitId&quantity`

### Procurement — Purchase Orders
- `POST /purchases`
- `GET /purchases?page&pageSize`
- `GET /purchases/:id`
- `PATCH /purchases/:id` (status update)
- `DELETE /purchases/:id` (cancel)

### Procurement — Goods Receipts
- `POST /procurement/receipts`
- `GET /procurement/receipts?page&pageSize`
- `GET /procurement/receipts/:id`

### Procurement — Invoices (read-only in MVP)
- `GET /procurement/invoices?page&pageSize`
- `GET /procurement/invoices/:id`

### Stock — Levels
- `GET /stock-levels?page&pageSize`
- `GET /stock-levels/:warehouseId/:itemId`

### Stock — Movements
- `POST /stock-movements`
- `GET /stock-movements?page&pageSize`
- `GET /stock-movements/:id`

### Integration
- `POST /integration/systems`
- `GET /integration/systems?page&pageSize`
- `POST /integration/systems/:id/rotate-keys`
- `DELETE /integration/systems/:id` (revoke)

## 7. Build order (suggested — confirm/adjust with Chris before starting)

1. Prisma schema for the full data model above + first migration
2. `shared/` scaffolding: Prisma client singleton, error handler
   middleware, Zod validation helper, pagination helper
3. Auth module (register + login + JWT middleware) — everything else
   depends on `req.user.companyId` existing
4. Company, Suppliers, Warehouses, Measurements (units) — simple CRUD,
   good warm-up and establishes the module pattern
5. Catalog (items + categories) — depends on Units
6. Nomenclature — depends on Items + Units
7. Procurement (purchase orders → goods receipts → invoices) — depends on
   Suppliers, Warehouses, Items; goods receipt is the first place stock
   actually moves
8. Stock (levels + movements) — depends on everything above;
   goods-receipt and BOM-activation flows should write StockMovement rows
9. Integration (external systems / API keys) — independent, can be done
   any time
10. Swagger docs generation from the Zod schemas / route definitions
11. Update the Postman collection to match anything that changed during
    implementation (e.g. the login endpoint, any resolved open questions)

## 8. Explicit non-goals for this MVP pass

- Full RBAC / granular permissions (deferred, per Chris)
- Offline-first / local-first sync (future phase, not this pass)
- ERPNext customization (separate future project)
- Anything under "Phase 2" in the MVP scope doc already delivered to the
  CEO — if you're unsure whether something is Phase 1 or 2, ask rather
  than build it

## 9. Open questions to raise with Chris before/while building

1. Does `POST /auth/user` get a `password` field, or is auth
   passwordless/magic-link (mirroring Pizzaland V2's pattern)?
2. Full enum values for `StockMovement.type` (only `CONSUMPTION` is shown).
3. Full enum values for `PurchaseOrder.status` (only `SENT` is shown).
4. Full enum values for `Supplier.type` (only `COMPANY` is shown).
5. ID format: prefixed ULID-style strings (`sup_...`, `itm_...`) as shown
   in Postman examples, or standard Prisma `cuid()`/`uuid()`?
6. Is `/api/v1/auth/user` (Authentication folder) vs
   `/api/v1/integration/systems` (Integration folder) — is the singular
   `/integration/system` request in the Authentication folder stale/a
   duplicate?
7. Should Category support nesting (`parentId`) in MVP, or stay flat?
