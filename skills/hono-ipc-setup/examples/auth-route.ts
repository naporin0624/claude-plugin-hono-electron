/**
 * Example Auth Route
 *
 * This example demonstrates a complete authentication route
 * with Zod validation and Result type error handling.
 */

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { HonoEnv } from '@shared/callable';

const app = new Hono<HonoEnv>();

// Zod schema for sign-in request body
const SignInBody = z.object({
  token: z.string().min(1, 'Token is required'),
});

// Helper to convert Observable to Promise for route handlers
// This assumes you're using RxJS and a utility like firstValueFrom
const firstValueFromResult = async <T>(observable: Promise<T>) => observable;

export const routes = app
  /**
   * GET /auth/token
   * Get current auth token
   * Returns 401 if not authenticated
   */
  .get('/token', async (c) => {
    const result = await firstValueFromResult(c.var.services.auth.value());

    if (result === undefined) {
      return c.json(null, 401);
    }

    return c.json({ token: result }, 200);
  })

  /**
   * POST /auth/sign_in
   * Sign in with auth token
   * Validates token format with Zod
   */
  .post('/sign_in', zValidator('json', SignInBody), async (c) => {
    const { token } = c.req.valid('json');

    const result = await c.var.services.auth.signIn(token);

    return result.match(
      () => c.json({ success: true }, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  })

  /**
   * POST /auth/sign_out
   * Sign out current user
   */
  .post('/sign_out', async (c) => {
    const result = await c.var.services.auth.signOut();

    return result.match(
      () => c.json({ success: true }, 200),
      (error) => c.json({ error: error.message }, 500)
    );
  });

/**
 * Client usage examples:
 *
 * // Check if authenticated
 * const res = await client.auth.token.$get();
 * if (res.status === 401) {
 *   // Not authenticated, show login
 * } else {
 *   const { token } = await res.json();
 *   // User is authenticated
 * }
 *
 * // Sign in
 * const res = await client.auth.sign_in.$post({
 *   json: { token: 'auth_xxx' }
 * });
 * if (res.ok) {
 *   // Signed in successfully
 * }
 *
 * // Sign out
 * await client.auth.sign_out.$post();
 */
