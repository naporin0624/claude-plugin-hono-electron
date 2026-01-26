/**
 * Example: Main Process Observable Subscription Setup
 *
 * This demonstrates the pattern for:
 * - Subscribing to service Observables in the main process
 * - Pushing updates to renderer via webContents.send()
 * - Window validity checks with isDestroyed()
 * - Proper cleanup on app quit
 * - Multi-window broadcast support
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
  email: string;
}

interface Event {
  id: number;
  name: string;
  status: 'active' | 'closed';
}

type Snapshot<T> = {
  type: 'create' | 'update' | 'delete';
  value: T;
};

// Service interfaces (CQRS pattern)
interface UserService {
  list(): Observable<User[]>;
}

interface EventService {
  active(): Observable<Event | undefined>;
  notify(): Observable<Snapshot<Event>>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Single Window Pattern
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Basic single-window subscription setup.
 *
 * Key points:
 * - Always check isDestroyed() before sending
 * - Use Subscription container for cleanup
 * - Handle errors in subscribe callbacks
 */
function setupSingleWindowSubscriptions(
  mainWindow: BrowserWindow,
  userService: UserService,
  eventService: EventService,
): Subscription {
  const subscription = new Subscription();

  // Subscribe to user list changes
  subscription.add(
    userService.list().subscribe({
      next: (users) => {
        // IMPORTANT: Check window validity before sending
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('users:changed', users);
        }
      },
      error: (error) => {
        console.error('UserService subscription error:', error);
      },
    }),
  );

  // Subscribe to active event changes
  subscription.add(
    eventService.active().subscribe({
      next: (event) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:activeEvent', event);
        }
      },
      error: (error) => {
        console.error('EventService active subscription error:', error);
      },
    }),
  );

  // Subscribe to granular event notifications
  subscription.add(
    eventService.notify().subscribe({
      next: (snapshot) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:modify:event', snapshot);
        }
      },
      error: (error) => {
        console.error('EventService notify subscription error:', error);
      },
    }),
  );

  return subscription;
}

// ═══════════════════════════════════════════════════════════════════════════
// Multi-Window Pattern
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Broadcast data to all windows.
 *
 * Use this when all windows need to receive the same update.
 */
function broadcastToAllWindows<T>(channel: string, data: T): void {
  const windows = BrowserWindow.getAllWindows();

  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  }
}

/**
 * Multi-window subscription setup.
 *
 * Use this pattern when your app has multiple windows
 * that all need to receive service updates.
 */
function setupMultiWindowSubscriptions(
  userService: UserService,
  eventService: EventService,
): Subscription {
  const subscription = new Subscription();

  subscription.add(
    userService.list().subscribe({
      next: (users) => {
        broadcastToAllWindows('users:changed', users);
      },
      error: (error) => {
        console.error('UserService subscription error:', error);
      },
    }),
  );

  subscription.add(
    eventService.active().subscribe({
      next: (event) => {
        broadcastToAllWindows('app:activeEvent', event);
      },
      error: (error) => {
        console.error('EventService active subscription error:', error);
      },
    }),
  );

  return subscription;
}

// ═══════════════════════════════════════════════════════════════════════════
// Targeted Window Pattern
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Window registry for targeted updates.
 *
 * Use this when different windows need different updates.
 */
class WindowRegistry {
  #windows = new Map<string, BrowserWindow>();

  register(id: string, window: BrowserWindow): void {
    this.#windows.set(id, window);

    window.on('closed', () => {
      this.#windows.delete(id);
    });
  }

  send<T>(windowId: string, channel: string, data: T): void {
    const window = this.#windows.get(windowId);

    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  }

  get(id: string): BrowserWindow | undefined {
    return this.#windows.get(id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Per-Window Subscription Pattern
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create subscriptions scoped to a specific window's lifecycle.
 *
 * Use this when subscriptions should be cleaned up
 * when a specific window closes.
 */
function createWindowWithSubscriptions(
  userService: UserService,
): BrowserWindow {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
  });

  const windowSubscription = new Subscription();

  windowSubscription.add(
    userService.list().subscribe({
      next: (users) => {
        if (!window.isDestroyed()) {
          window.webContents.send('users:changed', users);
        }
      },
      error: (error) => {
        console.error('Subscription error:', error);
      },
    }),
  );

  // Cleanup when this window closes
  window.on('closed', () => {
    windowSubscription.unsubscribe();
  });

  return window;
}

// ═══════════════════════════════════════════════════════════════════════════
// Full Application Example
// ═══════════════════════════════════════════════════════════════════════════

/*
// Example: Complete main process setup

import { app, BrowserWindow } from 'electron';
import { Subscription } from 'rxjs';
import { createContainer } from './container';

let mainWindow: BrowserWindow | null = null;
const subscription = new Subscription();

async function createWindow(): Promise<void> {
  const container = await createContainer();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  const userService = container.get<UserService>('UserService');
  const eventService = container.get<EventService>('EventService');

  // Setup subscriptions
  const windowSub = setupSingleWindowSubscriptions(
    mainWindow,
    userService,
    eventService,
  );
  subscription.add(windowSub);

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  // IMPORTANT: Cleanup all subscriptions
  subscription.unsubscribe();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
*/

export {
  setupSingleWindowSubscriptions,
  setupMultiWindowSubscriptions,
  broadcastToAllWindows,
  createWindowWithSubscriptions,
  WindowRegistry,
};
