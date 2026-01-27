/**
 * Example: Main Process Observable Subscription Setup
 *
 * Patterns for subscribing to service Observables and pushing to renderer.
 */

import { app, BrowserWindow } from 'electron';
import { Subscription } from 'rxjs';
import type { Observable } from 'rxjs';

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

interface User {
  id: string;
  name: string;
}

interface UserService {
  list(): Observable<User[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Single Window Pattern
// ═══════════════════════════════════════════════════════════════════════════

function setupSubscriptions(
  mainWindow: BrowserWindow,
  userService: UserService,
): Subscription {
  const subscription = new Subscription();

  subscription.add(
    userService.list().subscribe({
      next: (users) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('users:changed', users);
        }
      },
      error: (error) => {
        console.error('Subscription error:', error);
      },
    }),
  );

  return subscription;
}

// ═══════════════════════════════════════════════════════════════════════════
// Multi-Window Pattern
// ═══════════════════════════════════════════════════════════════════════════

function broadcastToAllWindows<T>(channel: string, data: T): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Targeted Window Pattern (functional)
// ═══════════════════════════════════════════════════════════════════════════

function createWindowRegistry() {
  const windows = new Map<string, BrowserWindow>();

  return {
    register(id: string, window: BrowserWindow): void {
      windows.set(id, window);
      window.on('closed', () => windows.delete(id));
    },
    unregister(id: string): void {
      windows.delete(id);
    },
    send<T>(windowId: string, channel: string, data: T): void {
      const window = windows.get(windowId);
      if (window && !window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    },
    disposeAll(): void {
      windows.clear();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Full Application Example
// ═══════════════════════════════════════════════════════════════════════════

/*
import { createContainer } from './container';

const subscription = new Subscription();

app.on('ready', async () => {
  const container = await createContainer();
  const mainWindow = new BrowserWindow({ width: 1200, height: 800 });
  const userService = container.get<UserService>('UserService');

  subscription.add(setupSubscriptions(mainWindow, userService));

  mainWindow.loadFile('index.html');
});

app.on('window-all-closed', () => {
  subscription.unsubscribe();
  app.quit();
});
*/

export { setupSubscriptions, broadcastToAllWindows, createWindowRegistry };
