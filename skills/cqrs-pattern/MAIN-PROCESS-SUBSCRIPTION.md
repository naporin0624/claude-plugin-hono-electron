# Main Process Observable Subscription Pattern

## Overview

Pattern for subscribing to service Observables in the Electron main process and notifying renderer processes via `webContents.send()`.

```
Service Observable → .subscribe() → isDestroyed() check → webContents.send() → Renderer
```

## Quick Start

```typescript
import { app, BrowserWindow } from 'electron';
import { Subscription } from 'rxjs';

const subscription = new Subscription();

app.on('ready', async () => {
  const mainWindow = new BrowserWindow({ /* options */ });
  const userService = container.get<UserService>('UserService');

  subscription.add(
    userService.list().subscribe({
      next: (users) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('users:changed', users);
        }
      },
      error: (error) => console.error('Subscription error:', error),
    })
  );
});

app.on('window-all-closed', () => {
  subscription.unsubscribe();
  app.quit();
});
```

## Key Points

| Aspect | Pattern |
|--------|---------|
| Window validity | Always check `isDestroyed()` before `webContents.send()` |
| Subscription management | Use single `Subscription` container with `.add()` |
| Cleanup | Call `subscription.unsubscribe()` on app quit |
| Error handling | Always provide error callback in subscribe |

## Multi-Window Broadcast

```typescript
function broadcastToAllWindows<T>(channel: string, data: T): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, data);
    }
  }
}
```

## Targeted Window Updates

```typescript
function createWindowRegistry() {
  const windows = new Map<string, BrowserWindow>();

  return {
    register(id: string, window: BrowserWindow): void {
      windows.set(id, window);
      window.on('closed', () => windows.delete(id));
    },
    send<T>(windowId: string, channel: string, data: T): void {
      const window = windows.get(windowId);
      if (window && !window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    },
  };
}
```

## Per-Window Subscription Cleanup

```typescript
function createWindowWithSubscriptions(userService: UserService): BrowserWindow {
  const window = new BrowserWindow({ width: 800, height: 600 });
  const windowSubscription = new Subscription();

  windowSubscription.add(
    userService.list().subscribe({
      next: (users) => {
        if (!window.isDestroyed()) {
          window.webContents.send('users:changed', users);
        }
      },
      error: (error) => console.error('Error:', error),
    })
  );

  window.on('closed', () => windowSubscription.unsubscribe());

  return window;
}
```

## Related Documentation

- [OBSERVABLE-PATTERN.md](OBSERVABLE-PATTERN.md) - Creating Observable queries in services
- [../jotai-reactive-atoms/EVENT-SUBSCRIPTION.md](../jotai-reactive-atoms/EVENT-SUBSCRIPTION.md) - Renderer-side IPC subscription optimization
- [examples/main-subscription.ts](examples/main-subscription.ts) - Complete implementation patterns
