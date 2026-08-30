# Yousra Stock — ERD Reference for Prisma Schema

This document is the source of truth for generating `prisma/schema.prisma`
(Prisma 7 — `schema.prisma` is shape-only; runtime config lives in
`prisma.config.ts`). It reflects "Yousra Stock - Revised ERD v2" on
Lucidchart plus decisions made after that diagram.

## Global conventions (apply to every model below)

- **IDs**: string primary keys (cuid or ulid — pick one and use it
  consistently across all models).
- **Soft delete**: every model in the "Reference / Catalog tables" section
  below has a nullable `deletedAt DateTime?`. `DELETE` endpoints set this
  timestamp rather than removing the row. Default queries filter
  `deletedAt: null`.
- **Timestamps**: every model has `createdAt DateTime @default(now())` and
  `updatedAt DateTime @updatedAt`, in addition to `deletedAt` where noted.
- **Multi-tenancy**: every model in the "Reference / Catalog tables" section
  has a `companyId String` foreign key to `Company`. This value is **never**
  accepted from the client — it's derived server-side from the
  authenticated user's context.
- **Audit**: `PurchaseOrder`, `GoodsReceipt`, `WarehouseTransfer`, and
  `StockMovement` each have a `createdBy String` foreign key to `User`
  (`employeeId`), also server-derived, never client-supplied.
- **Transactional records are never soft-deleted.** `PurchaseOrder`,
  `GoodsReceipt`, `StockMovement` don't have `deletedAt`. Cancellation is a
  `status` change (e.g. `PurchaseOrder.status = CANCELLED`), not a delete.
  `StockMovement` is append-only — corrections are new `ADJUSTMENT` rows,
  never edits.
- **Response envelope** (API layer, not schema): `{ data, meta }` on
  success, `{ error: { code, message, details } }` on failure. Not part of
  the Prisma schema itself but relevant if Claude Code is also touching
  the service/controller layer.

---

## Models

### Company
Tenant entity (Yousra, Parcland, future brands).

| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| name | String | |
| email | String | |
| phone | String | |
| address | String | |
| city | String | |
| country | String | |
| deletedAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

Relations: has many `User`, `Supplier`, `ItemCategory`, `Warehouse`, `Item`,
`ExternalSystem`.

---

### User
| Field | Type | Notes |
|---|---|---|
| employeeId | String | PK |
| firstName | String | |
| lastName | String | |
| role | Enum(`Admin`, `Manager`, `Staff`) | |
| email | String | |
| phone | String | |
| companyId | String | FK → Company |
| createdAt / updatedAt | DateTime | |

No `deletedAt` on User for now — deactivation strategy TBD with the team
(auth/permissions discussion is paused). Don't add soft delete here unless
told to.

---

### ExternalSystem
Represents Pizzaland, Finance, or any other API consumer.

| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| name | String | |
| description | String | |
| apiKeyHash | String | hashed, never store plaintext |
| apiSecretHash | String | hashed, never store plaintext |
| phone | String | |
| companyId | String | FK → Company |
| deletedAt | DateTime? | "revoke" sets this |
| createdAt / updatedAt | DateTime | |

Plaintext `apiKey`/`apiSecret` are generated and returned once at creation
(and on rotation) — never persisted, never re-returned. This is
application logic, not a schema field.

---

### Supplier
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| name | String | |
| country | String | |
| city | String | |
| address | String | |
| description | String? | |
| phone | String | |
| email | String | |
| type | Enum(`COMPANY`, `INDIVIDUAL`) | |
| companyId | String | FK → Company |
| deletedAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

---

### Unit
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| name | String | |
| symbol | String | |
| family | Enum(`MASS`, `VOLUME`, `UNIT`) | conversion only valid within same family |
| factorToBase | Decimal | ratio to the family's base unit |
| isBase | Boolean | exactly one base unit per family |
| deletedAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

No `companyId` — units are global reference data, not tenant-owned.

---

### ItemCategory
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| name | String | |
| companyId | String | FK → Company |
| deletedAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

---

### Item
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| name | String | |
| categoryId | String | FK → ItemCategory |
| baseUnitId | String | FK → Unit |
| companyId | String | FK → Company |
| isStockable | Boolean | |
| isBuyable | Boolean | |
| reorderThreshold | Decimal? | nullable — low-stock alert threshold |
| deletedAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

**No `warehouseId` on Item.** Location/quantity lives entirely in
`StockLevel` — an item is a catalog entry, not tied to one warehouse.

Batch/lot tracking (`trackBatches`, `batchId`) was **deliberately deferred**
— do not add these fields unless explicitly asked. If added later, it's a
new `Batch` model with `itemId`, `warehouseId`, `lotNumber`, `expiryDate`.

---

### Nomenclature (Bill of Materials)
Recipes: which sub-items + quantities constitute an item.

| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| itemId | String | FK → Item (the item this recipe produces) |
| isActive | Boolean | only one active version per itemId |
| version | Int | auto-incremented per itemId |
| notes | String? | |
| deletedAt | DateTime? | cannot soft-delete the active version |
| createdAt / updatedAt | DateTime | |

Versioning rule: editing an **active** nomenclature's lines is not allowed
via simple update — changing the recipe means creating a new
`Nomenclature` row (new version). This keeps historical `StockMovement`
deductions accurate even after recipes change. A dedicated "activate"
operation flips `isActive` and deactivates the item's previous active
version — not a plain field PATCH, since it has a side effect.

### NomenclatureLine
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| nomenclatureId | String | FK → Nomenclature |
| subItemId | String | FK → Item (correct type: **String**, not Boolean — this was a typo in an early draft) |
| quantity | Decimal | |
| unitId | String | FK → Unit |

---

### Warehouse
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| name | String | |
| companyId | String | FK → Company |
| deletedAt | DateTime? | |
| createdAt / updatedAt | DateTime | |

---

### PurchaseOrder
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| supplierId | String | FK → Supplier |
| warehouseId | String | FK → Warehouse |
| expectedAt | DateTime | |
| status | Enum(`DRAFT`, `SENT`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`) | |
| createdBy | String | FK → User.employeeId |
| createdAt / updatedAt | DateTime | |

No `deletedAt` — see "transactional records" convention above. Cancelling
sets `status = CANCELLED`.

### PurchaseOrderItem
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| purchaseOrderId | String | FK → PurchaseOrder |
| itemId | String | FK → Item |
| unitCost | Decimal | (was mistakenly typed as `date` in an early draft — correct type is Decimal) |
| quantity | Decimal | (also mistakenly typed as `date` early on — correct type is Decimal) |

---

### GoodsReceipt
Fulfillment of a PurchaseOrder. Supports partial delivery.

| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| purchaseOrderId | String | FK → PurchaseOrder — **this FK is what makes the procurement chain traceable end-to-end; an earlier draft had a disconnected `Receipt` table without it** |
| supplierId | String | FK → Supplier |
| warehouseId | String | FK → Warehouse |
| receivedAt | DateTime | |
| status | Enum(`PARTIALLY_RECEIVED`, `RECEIVED`) | |
| createdBy | String | FK → User.employeeId |
| createdAt / updatedAt | DateTime | |

### GoodsReceiptItem
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| receiptId | String | FK → GoodsReceipt |
| itemId | String | FK → Item |
| unitCost | Decimal | price actually paid — enables supplier price-trend queries with no extra table |
| quantity | Decimal | actual received quantity, may differ from PurchaseOrderItem.quantity |
| status | Enum(e.g. `RECEIVED`) | |

Side effects on create (application logic, not schema): increments
`StockLevel`, creates a `StockMovement` (type `STOCK_IN`, linked via
`receiptItemId`), auto-generates an `Invoice`, updates parent
`PurchaseOrder.status`.

---

### Invoice
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| goodsReceiptId | String | FK → GoodsReceipt |
| invoiceNumber | String | |
| amount | Decimal | |
| currency | String | e.g. `XAF` |
| issuedAt | DateTime | |

Read-only from the API — always auto-generated on goods receipt, never
created directly.

---

### WarehouseTransfer
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| fromWarehouseId | String | FK → Warehouse |
| toWarehouseId | String | FK → Warehouse |
| status | Enum(`PENDING`, `DISPATCHED`, `RECEIVED`, `DISCREPANCY`) | |
| date | DateTime | |
| createdBy | String | FK → User.employeeId |

*(Deferred to V2 per the MVP scope doc — schema can exist, but the
transfer dispatch/receive workflow itself is a V2 feature.)*

### WarehouseTransferItem
| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| transferId | String | FK → WarehouseTransfer |
| itemId | String | FK → Item |
| quantity | Decimal | |

---

### StockLevel
Current quantity per item per warehouse. **Read-only derived view** —
never written to directly; maintained by StockMovement side effects.

| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| itemId | String | FK → Item |
| warehouseId | String | FK → Warehouse |
| quantity | Decimal | |
| updatedAt | DateTime | |

Unique constraint: (`itemId`, `warehouseId`) — one row per item/warehouse
pair.

No `Value` field (monetary value) — deliberately excluded, derivable from
`quantity * latest unitCost` rather than stored (avoids staleness).

---

### StockMovement
**The traceability backbone.** Append-only log of every stock-affecting
action. This model replaces any separate "InventoryReport" table — reports
are just queries over this log.

| Field | Type | Notes |
|---|---|---|
| id | String | PK |
| type | Enum(`STOCK_IN`, `CONSUMPTION`, `MANUAL_OUT`, `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT`) | |
| itemId | String | FK → Item |
| warehouseId | String | FK → Warehouse |
| quantity | Decimal | signed or unsigned — pick a convention and document it (e.g. always positive, direction implied by `type`) |
| reason | Enum(`WASTE`, `SPOILAGE`, `INTERNAL_USE`, `THEFT`, `OTHER`)? | required only when `type = MANUAL_OUT` |
| nomenclatureId | String? | FK → Nomenclature, set when `type = CONSUMPTION` |
| receiptItemId | String? | FK → GoodsReceiptItem, set when `type = STOCK_IN` |
| transferItemId | String? | FK → WarehouseTransferItem, set when `type = TRANSFER_*` |
| createdBy | String | FK → User.employeeId (or resolved from ExternalSystem for API-originated movements — confirm with Chris how external-system-authored movements attribute `createdBy`) |
| updatedAt | DateTime | (movements aren't otherwise mutated — this is effectively the creation timestamp) |

Exactly one of `nomenclatureId` / `receiptItemId` / `transferItemId` should
be set depending on `type`; all three are nullable rather than using a
polymorphic association, since Postgres/Prisma handle a few nullable FKs
better than true polymorphism for this scale.

---

## Explicitly out of scope for this schema pass

- Batch/lot tracking (`Batch` model) — deferred to V2
- Physical count / reconciliation tables — deferred to V2
- Granular per-user permissions table — hardcoded in application code for
  now, not a DB table
- Reorder-alert notification log — `Item.reorderThreshold` exists; the
  alerting mechanism itself is V2 application logic, not schema

## Source

Derived from "Yousra Stock - Revised ERD v2" (Lucidchart) plus decisions
made in the API-design conversation (soft delete strategy, `companyId`
server-derivation, procurement chain fix, unit family/conversion, Company
contact fields). If Claude Code has the Lucid MCP connector configured, it
can cross-check by fetching the live document — but this file should be
treated as authoritative since it captures decisions made *after* the
diagram was last edited.
