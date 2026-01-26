# Main Process Observable Subscription Pattern

## Overview

This document describes the pattern for subscribing to service Observables in the Electron main process and notifying renderer processes via `webContents.send()`. This is essential for pushing real-time updates from the main process to the UI.

## Core Concept

```
┌─────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│   Service Observable (userService.list())                    │
│              │                                                │
│              │ .subscribe()                                   │
│              ▼                                                │
│   ┌─────────────────────────────┐                           │
│   │ Subscription Manager        │                           │
│   │ (RxJS Subscription)         │                           │
│   └─────────────┬───────────────┘                           │
│                 │                                            │
│                 │ Check window validity                      │
│                 │ mainWindow.isDestroyed()                   │
│                 ▼                                            │
│   ┌─────────────────────────────┐                           │
│   │ webContents.send(channel)   │──────────────────────┐    │
│   └─────────────────────────────┘                      │    │
│                                                         │    │
└─────────────────────────────────────────────────────────│────┘
                                                          │
                                                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS                          │
├─────────────────────────────────────────────────────────────┤
│   ipcRenderer.on(channel) → Update UI State                 │
└─────────────────────────────────────────────────────────────┘
```

## Basic Pattern (Single Window)

### Main Process Setup

```typescript
// src/main/index.ts
import { app, BrowserWindow } from 'electron';
import { Subscription } from 'rxjs';

// Create subscription container
const subscription = new Subscription();

app.on('ready', async () => {
  const mainWindow = new BrowserWindow({ /* options */ });

  // Get service from DI container
  const userService = container.get<UserService>('UserService');

  // Subscribe to service Observable
  subscription.add(
    userService.list().subscribe({
      next: (users) => {
        // Check window validity before sending
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('users:changed', users);
        }
      },
      error: (error) => {
        console.error('UserService subscription error:', error);
      },
    })
  );
});

// Cleanup on app quit
app.on('window-all-closed', () => {
  subscription.unsubscribe();
  app.quit();
});
```

### Renderer Process Handler

```typescript
// src/renderer/src/adapters/ipc.ts
export const usersSource = createEventSubscription<User[]>('users:changed');

// src/renderer/src/atoms/users.atom.ts
import { atom } from 'jotai';

export const usersAtom = atom<User[]>([]);

export const subscribeUsersAtom = atom(null, (get, set) => {
  return usersSource.subscribe((users) => {
    set(usersAtom, users);
  });
});
```

## Window Validity Check

Always check if the window is destroyed before sending IPC messages to prevent errors:

```typescript
subscription.add(
  eventService.active().subscribe((event) => {
    // IMPORTANT: Check before sending
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:activeEvent', event);
    }
  })
);
```

### Why This Matters

- Window can be closed while Observable is still emitting
- Sending to a destroyed window throws an error
- Prevents "Object has been destroyed" exceptions

## Multi-Window Support

For applications with multiple windows, broadcast to all windows:

```typescript
// src/main/index.ts
import { BrowserWindow } from 'electron';
import { Subscription } from 'rxjs';

const subscription = new Subscription();

function broadcastToAllWindows<T>(channel: string, data: T): void {
  const windows = BrowserWindow.getAllWindows();

  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  }
}

app.on('ready', async () => {
  const userService = container.get<UserService>('UserService');

  subscription.add(
    userService.list().subscribe({
      next: (users) => {
        broadcastToAllWindows('users:changed', users);
      },
      error: (error) => {
        console.error('UserService subscription error:', error);
      },
    })
  );
});

app.on('window-all-closed', () => {
  subscription.unsubscribe();
  app.quit();
});
```

### Targeted Window Updates

For scenarios where only specific windows need updates:

```typescript
// Track windows by purpose
const windowRegistry = new Map<string, BrowserWindow>();

function sendToWindow<T>(windowId: string, channel: string, data: T): void {
  const window = windowRegistry.get(windowId);

  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}

// Usage
subscription.add(
  dashboardService.stats().subscribe((stats) => {
    sendToWindow('dashboard', 'dashboard:stats', stats);
  })
);
```

## Subscription Cleanup

### Basic Cleanup

```typescript
const subscription = new Subscription();

// Add multiple subscriptions
subscription.add(userService.list().subscribe(/* ... */));
subscription.add(eventService.active().subscribe(/* ... */));
subscription.add(settingsService.changes().subscribe(/* ... */));

// Single cleanup call unsubscribes all
app.on('window-all-closed', () => {
  subscription.unsubscribe();
  app.quit();
});
```

### Cleanup on Window Close (Per-Window Subscriptions)

```typescript
function createWindowWithSubscriptions(): BrowserWindow {
  const window = new BrowserWindow({ /* options */ });
  const windowSubscription = new Subscription();

  // Subscribe to observables for this window
  windowSubscription.add(
    someService.data().subscribe((data) => {
      if (!window.isDestroyed()) {
        window.webContents.send('data:updated', data);
      }
    })
  );

  // Cleanup when window closes
  window.on('closed', () => {
    windowSubscription.unsubscribe();
  });

  return window;
}
```

## Complete Example

```typescript
// src/main/index.ts
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

  // Get services
  const userService = container.get<UserService>('UserService');
  const eventService = container.get<EventService>('EventService');

  // Subscribe to user list changes
  subscription.add(
    userService.list().subscribe({
      next: (users) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('users:changed', users);
        }
      },
      error: (err) => console.error('User subscription error:', err),
    })
  );

  // Subscribe to active event changes
  subscription.add(
    eventService.active().subscribe({
      next: (event) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:activeEvent', event);
        }
      },
      error: (err) => console.error('Event subscription error:', err),
    })
  );

  // Subscribe to granular event notifications
  subscription.add(
    eventService.notify().subscribe({
      next: (snapshot) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:modify:event', snapshot);
        }
      },
      error: (err) => console.error('Notify subscription error:', err),
    })
  );

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  // Cleanup all subscriptions
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
```

## Error Handling

### Handling Observable Errors

```typescript
subscription.add(
  userService.list().subscribe({
    next: (users) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('users:changed', users);
      }
    },
    error: (error) => {
      // Log error for debugging
      console.error('UserService subscription error:', error);

      // Optionally notify renderer of error state
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('users:error', {
          message: error.message,
        });
      }
    },
  })
);
```

### Retry on Error

```typescript
import { retry, catchError } from 'rxjs/operators';
import { EMPTY } from 'rxjs';

subscription.add(
  userService.list().pipe(
    retry({ count: 3, delay: 1000 }),
    catchError((error) => {
      console.error('UserService failed after retries:', error);
      return EMPTY;
    })
  ).subscribe((users) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('users:changed', users);
    }
  })
);
```

## Best Practices

### DO:

- Always check `window.isDestroyed()` before `webContents.send()`
- Use a single `Subscription` container to manage all subscriptions
- Call `subscription.unsubscribe()` on app quit
- Handle errors in subscribe callbacks
- Use descriptive channel names (e.g., `users:changed`, `app:activeEvent`)

### DON'T:

- Send to windows without checking if they are destroyed
- Forget to unsubscribe when the app closes
- Create subscriptions without adding them to a container
- Ignore Observable errors (always provide error handler)

## Related Documentation

- [OBSERVABLE-PATTERN.md](OBSERVABLE-PATTERN.md) - Creating Observable queries in services
- [RESULT-TYPES.md](RESULT-TYPES.md) - Command patterns with ResultAsync
- [../jotai-reactive-atoms/EVENT-SUBSCRIPTION.md](../jotai-reactive-atoms/EVENT-SUBSCRIPTION.md) - Renderer-side IPC subscription optimization
