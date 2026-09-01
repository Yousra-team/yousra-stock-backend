import swaggerJsdoc from 'swagger-jsdoc';
import { z } from 'zod';

import { registerUserSchema, loginSchema } from './modules/auth/auth.schema';
import { createCompanySchema, updateCompanySchema } from './modules/company/company.schema';
import { createSupplierSchema, updateSupplierSchema } from './modules/suppliers/supplier.schema';
import { createWarehouseSchema, updateWarehouseSchema } from './modules/warehouses/warehouse.schema';
import { createUnitSchema, updateUnitSchema } from './modules/measurements/unit.schema';
import { createCategorySchema, updateCategorySchema } from './modules/catalog/category.schema';
import { createItemSchema, updateItemSchema } from './modules/catalog/item.schema';
import {
  createNomenclatureSchema,
  updateNomenclatureSchema,
} from './modules/nomenclature/nomenclature.schema';
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderStatusSchema,
} from './modules/procurement/purchase-order.schema';
import { createGoodsReceiptSchema } from './modules/procurement/goods-receipt.schema';
import { createStockMovementSchema } from './modules/stock/stock.schema';
import { createExternalSystemSchema } from './modules/integration/integration.schema';

/**
 * Every request body is validated by a Zod schema (see the `*.schema.ts`
 * files). Rather than hand-writing the same shapes a second time in the
 * OpenAPI JSDoc, we convert those schemas to JSON Schema here and expose
 * them as `components.schemas`. The route `@openapi` blocks then just
 * `$ref` them — one source of truth for validation and docs.
 */
const requestSchemas = {
  RegisterUserInput: registerUserSchema,
  LoginInput: loginSchema,
  CreateCompanyInput: createCompanySchema,
  UpdateCompanyInput: updateCompanySchema,
  CreateSupplierInput: createSupplierSchema,
  UpdateSupplierInput: updateSupplierSchema,
  CreateWarehouseInput: createWarehouseSchema,
  UpdateWarehouseInput: updateWarehouseSchema,
  CreateUnitInput: createUnitSchema,
  UpdateUnitInput: updateUnitSchema,
  CreateCategoryInput: createCategorySchema,
  UpdateCategoryInput: updateCategorySchema,
  CreateItemInput: createItemSchema,
  UpdateItemInput: updateItemSchema,
  CreateNomenclatureInput: createNomenclatureSchema,
  UpdateNomenclatureInput: updateNomenclatureSchema,
  CreatePurchaseOrderInput: createPurchaseOrderSchema,
  UpdatePurchaseOrderStatusInput: updatePurchaseOrderStatusSchema,
  CreateGoodsReceiptInput: createGoodsReceiptSchema,
  CreateStockMovementInput: createStockMovementSchema,
  CreateExternalSystemInput: createExternalSystemSchema,
} as const;

function zodToOpenApi(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
    reused: 'inline',
    override: (ctx) => {
      // `format` already communicates the constraint; the verbose backing
      // regex just clutters the Swagger UI.
      if ('format' in ctx.jsonSchema && 'pattern' in ctx.jsonSchema) {
        delete ctx.jsonSchema['pattern'];
      }
    },
  }) as Record<string, unknown>;
}

const generatedSchemas = Object.fromEntries(
  Object.entries(requestSchemas).map(([name, schema]) => [name, zodToOpenApi(schema)]),
);

// ---------------------------------------------------------------------------
// Response (output) shapes. Hand-written — these mirror the Prisma contract
// rows the services return, minus secrets (passwordHash, apiKeyHash, ...).
// `timestamp` / `uuid` / `decimal` are reused field shapes.
// ---------------------------------------------------------------------------
const uuid = { type: 'string', format: 'uuid' } as const;
const timestamp = { type: 'string', format: 'date-time' } as const;
const decimal = { type: 'string', description: 'Decimal serialised as a string.', example: '12.5' } as const;

/**
 * Every list/detail GET eager-loads its foreign keys, so alongside each `xId`
 * scalar the response also carries a nested object with the referenced row's
 * label fields. These `*Ref` shapes are those nested objects.
 */
const ref = {
  type: 'object',
  nullable: true,
  properties: { id: uuid, name: { type: 'string' } },
} as const;
const unitRef = {
  type: 'object',
  nullable: true,
  properties: { id: uuid, name: { type: 'string' }, symbol: { type: 'string' } },
} as const;
const userRef = {
  type: 'object',
  nullable: true,
  properties: { employeeId: uuid, firstName: { type: 'string' }, lastName: { type: 'string' } },
} as const;

const entitySchemas = {
  Ref: ref,
  UnitRef: unitRef,
  UserRef: userRef,
  AuthResult: {
    type: 'object',
    properties: {
      user: { $ref: '#/components/schemas/User' },
      token: { type: 'string', description: 'Signed JWT — send as `Authorization: Bearer <token>`.' },
    },
  },
  User: {
    type: 'object',
    properties: {
      employeeId: uuid,
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      role: { type: 'string', enum: ['Admin', 'Manager', 'Staff'] },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      companyId: uuid,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  Company: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      address: { type: 'string' },
      city: { type: 'string' },
      country: { type: 'string' },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  Supplier: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      country: { type: 'string' },
      city: { type: 'string' },
      address: { type: 'string' },
      description: { type: 'string', nullable: true },
      phone: { type: 'string' },
      email: { type: 'string', format: 'email' },
      type: { type: 'string', enum: ['COMPANY', 'INDIVIDUAL'] },
      companyId: uuid,
      company: ref,
      deletedAt: { ...timestamp, nullable: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  Warehouse: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      companyId: uuid,
      company: ref,
      deletedAt: { ...timestamp, nullable: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  Unit: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      symbol: { type: 'string' },
      family: { type: 'string', enum: ['MASS', 'VOLUME', 'UNIT'] },
      factorToBase: decimal,
      isBase: { type: 'boolean' },
      deletedAt: { ...timestamp, nullable: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  ItemCategory: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      companyId: uuid,
      company: ref,
      deletedAt: { ...timestamp, nullable: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  Item: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      categoryId: uuid,
      category: ref,
      baseUnitId: uuid,
      baseUnit: unitRef,
      companyId: uuid,
      company: ref,
      isStockable: { type: 'boolean' },
      isBuyable: { type: 'boolean' },
      reorderThreshold: { ...decimal, nullable: true },
      deletedAt: { ...timestamp, nullable: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  NomenclatureLine: {
    type: 'object',
    properties: {
      id: uuid,
      nomenclatureId: uuid,
      subItemId: uuid,
      subItem: ref,
      quantity: decimal,
      unitId: uuid,
      unit: unitRef,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  Nomenclature: {
    type: 'object',
    properties: {
      id: uuid,
      itemId: uuid,
      item: ref,
      isActive: { type: 'boolean' },
      version: { type: 'integer', example: 1 },
      notes: { type: 'string', nullable: true },
      lines: { type: 'array', items: { $ref: '#/components/schemas/NomenclatureLine' } },
      deletedAt: { ...timestamp, nullable: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  PurchaseOrderItem: {
    type: 'object',
    properties: {
      id: uuid,
      purchaseOrderId: uuid,
      itemId: uuid,
      item: ref,
      unitCost: decimal,
      quantity: decimal,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  PurchaseOrder: {
    type: 'object',
    properties: {
      id: uuid,
      reference: {
        type: 'string',
        nullable: true,
        description: 'Human-readable document number. Null only on rows created before this field existed.',
        example: 'PO-26-09-01-001',
      },
      supplierId: uuid,
      supplier: ref,
      warehouseId: uuid,
      warehouse: ref,
      expectedAt: timestamp,
      status: { type: 'string', enum: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] },
      createdBy: uuid,
      creator: userRef,
      items: { type: 'array', items: { $ref: '#/components/schemas/PurchaseOrderItem' } },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  GoodsReceiptItem: {
    type: 'object',
    properties: {
      id: uuid,
      receiptId: uuid,
      itemId: uuid,
      item: ref,
      unitCost: decimal,
      quantity: decimal,
      status: { type: 'string', enum: ['RECEIVED'] },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  Invoice: {
    type: 'object',
    properties: {
      id: uuid,
      goodsReceiptId: uuid,
      goodsReceipt: {
        type: 'object',
        nullable: true,
        properties: {
          id: uuid,
          status: { type: 'string' },
          receivedAt: timestamp,
          supplier: ref,
          warehouse: ref,
        },
      },
      invoiceNumber: {
        type: 'string',
        description: 'Human-readable invoice number. Rows created before this format shipped keep their legacy `INV-<uuid>` value.',
        example: 'INV-26-09-01-001',
      },
      amount: decimal,
      currency: { type: 'string', example: 'XAF' },
      issuedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  GoodsReceipt: {
    type: 'object',
    properties: {
      id: uuid,
      reference: {
        type: 'string',
        nullable: true,
        description: 'Human-readable document number. Null only on rows created before this field existed.',
        example: 'GR-26-09-01-001',
      },
      purchaseOrderId: uuid,
      purchaseOrder: {
        type: 'object',
        nullable: true,
        properties: { id: uuid, status: { type: 'string' } },
      },
      supplierId: uuid,
      supplier: ref,
      warehouseId: uuid,
      warehouse: ref,
      receivedAt: timestamp,
      status: { type: 'string', enum: ['PARTIALLY_RECEIVED', 'RECEIVED'] },
      createdBy: uuid,
      creator: userRef,
      items: { type: 'array', items: { $ref: '#/components/schemas/GoodsReceiptItem' } },
      invoice: { allOf: [{ $ref: '#/components/schemas/Invoice' }], nullable: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  StockLevel: {
    type: 'object',
    properties: {
      id: uuid,
      itemId: uuid,
      item: ref,
      warehouseId: uuid,
      warehouse: ref,
      quantity: decimal,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  StockMovement: {
    type: 'object',
    properties: {
      id: uuid,
      reference: {
        type: 'string',
        nullable: true,
        description: 'Human-readable document number. Null only on rows created before this field existed.',
        example: 'SM-26-09-01-001',
      },
      type: {
        type: 'string',
        enum: ['STOCK_IN', 'CONSUMPTION', 'MANUAL_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT'],
      },
      itemId: uuid,
      item: ref,
      warehouseId: uuid,
      warehouse: ref,
      quantity: { ...decimal, description: 'Always positive — direction is implied by `type`.' },
      reason: {
        type: 'string',
        enum: ['WASTE', 'SPOILAGE', 'INTERNAL_USE', 'THEFT', 'OTHER'],
        nullable: true,
      },
      nomenclatureId: { ...uuid, nullable: true },
      nomenclature: {
        type: 'object',
        nullable: true,
        properties: { id: uuid, version: { type: 'integer' }, isActive: { type: 'boolean' } },
      },
      receiptItemId: { ...uuid, nullable: true },
      receiptItem: {
        type: 'object',
        nullable: true,
        properties: { id: uuid, itemId: uuid },
      },
      transferItemId: { ...uuid, nullable: true },
      transferItem: {
        type: 'object',
        nullable: true,
        properties: { id: uuid, itemId: uuid },
      },
      createdBy: uuid,
      creator: userRef,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  ExternalSystem: {
    type: 'object',
    properties: {
      id: uuid,
      name: { type: 'string' },
      description: { type: 'string' },
      phone: { type: 'string' },
      companyId: uuid,
      company: ref,
      deletedAt: { ...timestamp, nullable: true },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  IssuedCredentials: {
    type: 'object',
    description: 'The plaintext `apiKey` / `apiSecret` are returned only here — never stored, never returned again.',
    properties: {
      system: { $ref: '#/components/schemas/ExternalSystem' },
      apiKey: { type: 'string' },
      apiSecret: { type: 'string' },
    },
  },
};

/** `{ page, pageSize, total }` — present on every list response. */
const paginationMetaSchema = {
  type: 'object',
  required: ['page', 'pageSize', 'total'],
  properties: {
    page: { type: 'integer', example: 1 },
    pageSize: { type: 'integer', example: 20 },
    total: { type: 'integer', example: 137 },
  },
};

/** The `errorHandler` / `notFoundHandler` envelope. */
const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['message', 'code'],
      properties: {
        message: { type: 'string', example: 'Resource not found' },
        code: {
          type: 'string',
          example: 'NOT_FOUND',
          description:
            'Machine-readable code: NOT_FOUND, VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, CONFLICT, INTERNAL_ERROR.',
        },
        details: {
          type: 'object',
          nullable: true,
          description: 'Only on VALIDATION_ERROR — Zod `flatten()` output.',
        },
      },
    },
  },
};

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Yousra Stock API',
      version: '1.0.0',
      description: [
        'Internal ERP/stock management API for Yousra Company.',
        '',
        '**Response envelope**',
        '- Single resource: `{ "data": { ... } }`',
        '- List: `{ "data": [ ... ], "meta": { "page", "pageSize", "total" } }`',
        '- Error: `{ "error": { "message": string, "code": string } }`',
      ].join('\n'),
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      parameters: {
        PageParam: {
          name: 'page',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        PageSizeParam: {
          name: 'pageSize',
          in: 'query',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        IdParam: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      },
      schemas: {
        ...generatedSchemas,
        ...entitySchemas,
        PaginationMeta: paginationMetaSchema,
        ErrorResponse: errorResponseSchema,
      },
      responses: {
        BadRequest: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: { message: 'Validation failed', code: 'VALIDATION_ERROR' } },
            },
          },
        },
        Unauthorized: {
          description: 'Missing or invalid bearer token',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: { message: 'Authentication required', code: 'UNAUTHORIZED' } },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: { message: 'Resource not found', code: 'NOT_FOUND' } },
            },
          },
        },
        Conflict: {
          description: 'Conflicts with current state',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { error: { message: 'Insufficient stock for this movement', code: 'CONFLICT' } },
            },
          },
        },
      },
    },
  },
  // JSDoc `@openapi` blocks live on the route files.
  apis: ['./src/modules/**/*.routes.ts'],
};

export const openapiSpec = swaggerJsdoc(options);
