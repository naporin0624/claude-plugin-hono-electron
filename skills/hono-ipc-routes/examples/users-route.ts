/**
 * Example: Complete Users Route Implementation
 *
 * Demonstrates:
 * - CQRS integration (Query via Observable, Command via ResultAsync)
 * - Zod validation for request bodies
 * - Error handling patterns
 * - Nested routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { firstValueFromResult } from '@utils/observable';
import type { AppVariables } from '../index';

// ═══════════════════════════════════════════════════════════════════════════
// Schema Definitions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Schema for creating a user.
 * Used by zValidator to validate and type POST request body.
 */
const createUserSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(50),
  bio: z.string().max(500).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

/**
 * Schema for updating a user.
 * All fields are optional for partial updates.
 */
const updateUserSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

/**
 * Schema for batch operations.
 */
const batchUserSchema = z.object({
  users: z.array(createUserSchema).min(1).max(100),
});

// ═══════════════════════════════════════════════════════════════════════════
// Route Implementation
// ═══════════════════════════════════════════════════════════════════════════

export const route = new Hono<{ Variables: AppVariables }>()
  // ─────────────────────────────────────────────────────────────────────────
  // GET /users - List all users
  // ─────────────────────────────────────────────────────────────────────────
  .get('/', async (c) => {
    // Parse query parameters
    const friendOnly = c.req.query('friendOnly') === 'true';

    // Call service query (returns Observable)
    const result = await firstValueFromResult(
      c.var.services.users.list({ friendOnly })
    );

    // Handle result
    return result.match(
      (users) => c.json(users, 200),
      (error) => {
        console.error('Failed to list users:', error);
        return c.json({ error: 'Failed to fetch users' }, 500);
      }
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // GET /users/:id - Get single user by ID
  // ─────────────────────────────────────────────────────────────────────────
  .get('/:id', async (c) => {
    const id = c.req.param('id');

    const result = await firstValueFromResult(
      c.var.services.users.get(id)
    );

    return result.match(
      (user) => {
        if (user === undefined) {
          return c.json({ error: 'User not found' }, 404);
        }
        return c.json(user, 200);
      },
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // POST /users - Create single user
  // ─────────────────────────────────────────────────────────────────────────
  .post('/', zValidator('json', createUserSchema), async (c) => {
    const data = c.req.valid('json');

    // Call service command (returns ResultAsync)
    const result = await c.var.services.users.create([data]);

    return result.match(
      () => c.json({ success: true }, 201),
      (error) => {
        // Map specific errors to HTTP status codes
        if (error.message.includes('already exists')) {
          return c.json({ error: 'User already exists' }, 409);
        }
        return c.json({ error: error.message }, 500);
      }
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // POST /users/batch - Create multiple users
  // ─────────────────────────────────────────────────────────────────────────
  .post('/batch', zValidator('json', batchUserSchema), async (c) => {
    const { users } = c.req.valid('json');

    const result = await c.var.services.users.create(users);

    return result.match(
      () => c.json({ success: true, count: users.length }, 201),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /users/:id - Update user
  // ─────────────────────────────────────────────────────────────────────────
  .put('/:id', zValidator('json', updateUserSchema), async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');

    // Validate at least one field is being updated
    if (Object.keys(data).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    const result = await c.var.services.users.update({ id, ...data });

    return result.match(
      () => c.json({ success: true }, 200),
      (error) => {
        if (error.message.includes('not found')) {
          return c.json({ error: 'User not found' }, 404);
        }
        return c.json({ error: error.message }, 500);
      }
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /users/:id - Delete user
  // ─────────────────────────────────────────────────────────────────────────
  .delete('/:id', async (c) => {
    const id = c.req.param('id');

    const result = await c.var.services.users.delete(id);

    return result.match(
      () => c.json({ success: true }, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  // ─────────────────────────────────────────────────────────────────────────
  // GET /users/:id/friends - Get user's friends (nested resource)
  // ─────────────────────────────────────────────────────────────────────────
  .get('/:id/friends', async (c) => {
    const id = c.req.param('id');

    const result = await firstValueFromResult(
      c.var.services.users.getFriends(id)
    );

    return result.match(
      (friends) => c.json(friends, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  });

// ═══════════════════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════════════════

export const users = { route };
