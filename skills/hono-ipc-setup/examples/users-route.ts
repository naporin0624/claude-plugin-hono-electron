/**
 * Example Users Route
 *
 * This example demonstrates a complete CRUD route
 * with query parameters, path parameters, and Zod validation.
 */

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { HonoEnv } from '@shared/callable';

const app = new Hono<HonoEnv>();

// Zod schemas for request validation
const UserIdParam = z.object({
  id: z.string().regex(/^usr_[a-zA-Z0-9]+$/, 'Invalid user ID format'),
});

const ListQueryParams = z.object({
  limit: z.coerce.number().int().positive().max(100).default(10),
  offset: z.coerce.number().int().nonnegative().default(0),
  search: z.string().optional(),
  includeInactive: z.coerce.boolean().optional().default(false),
});

const CreateUserBody = z.object({
  displayName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  bio: z.string().max(500).optional(),
});

const UpdateUserBody = CreateUserBody.partial();

// Error handler helper
const handleError = (c: any, error: any) => {
  switch (error.type) {
    case 'NotFound':
      return c.json({ error: 'User not found' }, 404);
    case 'Conflict':
      return c.json({ error: error.message }, 409);
    case 'Validation':
      return c.json({ error: error.message }, 400);
    default:
      return c.json({ error: 'Internal server error' }, 500);
  }
};

export const routes = app
  /**
   * GET /users
   * List all users with pagination and filtering
   */
  .get('/', zValidator('query', ListQueryParams), async (c) => {
    const { limit, offset, search, includeInactive } = c.req.valid('query');

    const result = await c.var.services.users.list({
      limit,
      offset,
      search,
      includeInactive,
    });

    return result.match(
      (users) => c.json(users, 200),
      (error) => handleError(c, error)
    );
  })

  /**
   * GET /users/:id
   * Get a single user by ID
   */
  .get('/:id', zValidator('param', UserIdParam), async (c) => {
    const { id } = c.req.valid('param');

    const result = await c.var.services.users.get(id);

    return result.match(
      (user) => {
        if (user === undefined) {
          return c.json({ error: 'User not found' }, 404);
        }
        return c.json(user, 200);
      },
      (error) => handleError(c, error)
    );
  })

  /**
   * POST /users
   * Create a new user
   */
  .post('/', zValidator('json', CreateUserBody), async (c) => {
    const body = c.req.valid('json');

    const result = await c.var.services.users.create(body);

    return result.match(
      (user) => c.json(user, 201),
      (error) => handleError(c, error)
    );
  })

  /**
   * PUT /users/:id
   * Update an existing user
   */
  .put(
    '/:id',
    zValidator('param', UserIdParam),
    zValidator('json', UpdateUserBody),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');

      const result = await c.var.services.users.update(id, body);

      return result.match(
        (user) => c.json(user, 200),
        (error) => handleError(c, error)
      );
    }
  )

  /**
   * DELETE /users/:id
   * Delete a user
   */
  .delete('/:id', zValidator('param', UserIdParam), async (c) => {
    const { id } = c.req.valid('param');

    const result = await c.var.services.users.delete(id);

    return result.match(
      () => c.json({ deleted: true }, 200),
      (error) => handleError(c, error)
    );
  })

  /**
   * GET /users/:id/posts
   * Get posts for a specific user (nested resource example)
   */
  .get('/:id/posts', zValidator('param', UserIdParam), async (c) => {
    const { id } = c.req.valid('param');

    const result = await c.var.services.users.getPosts(id);

    return result.match(
      (posts) => c.json(posts, 200),
      (error) => handleError(c, error)
    );
  });

/**
 * Client usage examples:
 *
 * // List users with pagination
 * const res = await client.users.$get({
 *   query: { limit: '20', offset: '0', search: 'john' }
 * });
 * const users = await res.json();
 *
 * // Get single user
 * const res = await client.users[':id'].$get({
 *   param: { id: 'usr_123' }
 * });
 * const user = await res.json();
 *
 * // Create user
 * const res = await client.users.$post({
 *   json: { displayName: 'John Doe', email: 'john@example.com' }
 * });
 * const newUser = await res.json();
 *
 * // Update user
 * const res = await client.users[':id'].$put({
 *   param: { id: 'usr_123' },
 *   json: { displayName: 'Updated Name' }
 * });
 *
 * // Delete user
 * await client.users[':id'].$delete({
 *   param: { id: 'usr_123' }
 * });
 *
 * // Get user's posts
 * const res = await client.users[':id'].posts.$get({
 *   param: { id: 'usr_123' }
 * });
 * const posts = await res.json();
 */
