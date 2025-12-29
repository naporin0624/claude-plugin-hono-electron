# Zod Validation for Hono IPC

Complete guide to request validation using Zod in Hono routes.

## Setup

```bash
pnpm add zod @hono/zod-validator
```

## Basic Usage

```typescript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const CreateUserBody = z.object({
  name: z.string(),
  email: z.string().email(),
});

.post('/users', zValidator('json', CreateUserBody), (c) => {
  const body = c.req.valid('json');
  // body is fully typed: { name: string, email: string }
})
```

## Validation Targets

### JSON Body

```typescript
const CreateBody = z.object({
  name: z.string().min(1).max(100),
  count: z.number().int().positive(),
});

.post('/', zValidator('json', CreateBody), (c) => {
  const { name, count } = c.req.valid('json');
})
```

### Query Parameters

```typescript
// Note: Query params are always strings, use coerce for numbers
const QueryParams = z.object({
  limit: z.coerce.number().int().positive().default(10),
  offset: z.coerce.number().int().nonnegative().default(0),
  search: z.string().optional(),
  active: z.coerce.boolean().optional(),
});

.get('/', zValidator('query', QueryParams), (c) => {
  const { limit, offset, search, active } = c.req.valid('query');
  // limit: number, offset: number, search: string | undefined
})
```

### Path Parameters

```typescript
const PathParams = z.object({
  id: z.string().uuid(),
  type: z.enum(['user', 'admin', 'guest']),
});

.get('/:type/:id', zValidator('param', PathParams), (c) => {
  const { id, type } = c.req.valid('param');
  // id: string (UUID), type: 'user' | 'admin' | 'guest'
})
```

### Headers

```typescript
const RequiredHeaders = z.object({
  authorization: z.string().startsWith('Bearer '),
  'x-request-id': z.string().uuid().optional(),
});

.post('/', zValidator('header', RequiredHeaders), (c) => {
  const { authorization } = c.req.valid('header');
})
```

## Common Schema Patterns

### String Validation

```typescript
// Basic constraints
z.string().min(1)              // Non-empty
z.string().max(100)            // Max length
z.string().length(10)          // Exact length

// Format validation
z.string().email()             // Email format
z.string().url()               // URL format
z.string().uuid()              // UUID format
z.string().datetime()          // ISO datetime
z.string().ip()                // IP address

// Custom patterns
z.string().regex(/^usr_[a-zA-Z0-9]+$/)  // Custom pattern
z.string().startsWith('prefix_')
z.string().endsWith('_suffix')
```

### Number Validation

```typescript
// Basic constraints
z.number().int()               // Integer only
z.number().positive()          // > 0
z.number().nonnegative()       // >= 0
z.number().min(0).max(100)     // Range

// Coercion (for query params)
z.coerce.number()              // Convert string to number
z.coerce.number().int().positive().max(100).default(10)
```

### Boolean Validation

```typescript
z.boolean()
z.coerce.boolean()             // 'true'/'false' strings
```

### Array Validation

```typescript
z.array(z.string())            // Array of strings
z.array(z.number()).min(1)     // Non-empty array
z.array(z.string()).max(10)    // Max 10 items
```

### Object Validation

```typescript
const User = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().int().optional(),
});

// Partial (all fields optional)
const UpdateUser = User.partial();

// Pick specific fields
const CreateUser = User.pick({ name: true, email: true });

// Omit fields
const PublicUser = User.omit({ email: true });

// Extend
const AdminUser = User.extend({
  role: z.literal('admin'),
});
```

### Enum Validation

```typescript
// String enum
z.enum(['active', 'inactive', 'pending'])

// Native enum
enum Status { Active, Inactive, Pending }
z.nativeEnum(Status)
```

### Union Types

```typescript
// Simple union
z.union([z.string(), z.number()])

// Discriminated union
const Event = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create'), data: CreateData }),
  z.object({ type: z.literal('update'), id: z.string(), data: UpdateData }),
  z.object({ type: z.literal('delete'), id: z.string() }),
]);
```

## Custom Validation

### Custom Error Messages

```typescript
const Schema = z.object({
  email: z.string().email({ message: 'Invalid email format' }),
  age: z.number()
    .min(18, { message: 'Must be at least 18 years old' })
    .max(120, { message: 'Age seems unrealistic' }),
});
```

### Custom Refinement

```typescript
const Password = z.string()
  .min(8)
  .refine(
    (val) => /[A-Z]/.test(val),
    { message: 'Must contain uppercase letter' }
  )
  .refine(
    (val) => /[0-9]/.test(val),
    { message: 'Must contain number' }
  );
```

### Transform

```typescript
const DateString = z.string()
  .datetime()
  .transform((str) => new Date(str));

const TrimmedString = z.string()
  .transform((str) => str.trim());
```

## Error Handling

### Custom Error Hook

```typescript
import { zValidator } from '@hono/zod-validator';

const validatorWithErrorHandler = (target: string, schema: z.ZodSchema) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'Validation failed',
          details: result.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400
      );
    }
  });

// Usage
.post('/', validatorWithErrorHandler('json', CreateBody), (c) => { ... })
```

## Reusable Schemas

### Common Schemas Module

```typescript
// src/shared/schemas/common.ts
import { z } from 'zod';

// ID patterns
export const UserId = z.string().regex(/^usr_[a-zA-Z0-9]+$/);
export const EventId = z.string().regex(/^evt_[a-zA-Z0-9]+$/);

// Pagination
export const PaginationQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(10),
  offset: z.coerce.number().int().nonnegative().default(0),
});

// Date range
export const DateRangeQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).refine(
  (data) => {
    if (data.from && data.to) {
      return new Date(data.from) <= new Date(data.to);
    }
    return true;
  },
  { message: 'From date must be before to date' }
);
```

### Usage in Routes

```typescript
import { PaginationQuery, UserId } from '@shared/schemas/common';

.get('/', zValidator('query', PaginationQuery), (c) => { ... })
.get('/:id', zValidator('param', z.object({ id: UserId })), (c) => { ... })
```

## Type Inference

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

// Infer TypeScript type from schema
type CreateUserInput = z.infer<typeof CreateUserSchema>;
// { name: string; email: string }

// Use in service interface
interface UserService {
  create(data: CreateUserInput): ResultAsync<User, Error>;
}
```
