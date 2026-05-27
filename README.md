# @ex-web-tools/web-updater

Detect frontend app updates by polling your entry HTML in a browser worker.

It is framework agnostic and works with Vite, Vue, React, and regular SPA projects. By
default it compares the `etag` response header. If your server does not return `etag`,
you can switch to `last-modified`.

## Install

```bash
pnpm add @ex-web-tools/web-updater
```

```bash
npm install @ex-web-tools/web-updater
yarn add @ex-web-tools/web-updater
```

## Quick Start

```ts
import { createWebUpdater } from '@ex-web-tools/web-updater'

createWebUpdater({
  htmlFileUrl: '/',
  onUpdate(updater) {
    const shouldRefresh = window.confirm('发现新版本，是否立即刷新？')

    if (shouldRefresh) {
      updater.refresh()
    } else {
      updater.ignoreCurrentVersion()
      updater.start()
    }
  },
})
```

## Vite

```ts
import { createWebUpdater } from '@ex-web-tools/web-updater'

createWebUpdater({
  htmlFileUrl: import.meta.env.BASE_URL,
  interval: 2 * 60 * 1000,
  onUpdate(updater) {
    updater.refresh()
  },
})
```

## Use Last-Modified

```ts
import { createWebUpdater } from '@ex-web-tools/web-updater'

createWebUpdater({
  htmlFileUrl: '/',
  headerName: 'last-modified',
  onUpdate(updater) {
    updater.refresh()
  },
})
```

## API

### `createWebUpdater(options)`

Creates and starts a `WebUpdater` instance.

```ts
import { createWebUpdater } from '@ex-web-tools/web-updater'

const updater = createWebUpdater({
  htmlFileUrl: '/',
})
```

### `new WebUpdater(options)`

Creates and starts a `WebUpdater` instance with the same behavior as
`createWebUpdater`.

```ts
import { WebUpdater } from '@ex-web-tools/web-updater'

const updater = new WebUpdater({
  htmlFileUrl: '/',
})
```

### `updater.start()`

Starts polling. The instance starts automatically after its first successful `HEAD`
request, so this is mainly useful after calling `stop()`.

### `updater.stop()`

Stops polling and terminates the internal worker.

### `updater.refresh()`

Stores the latest detected value and reloads the current page.

### `updater.ignoreCurrentVersion()`

Stores the latest detected value without reloading the current page. Use this when
the user dismisses an update prompt and should not be prompted again for the same
version.

### `updater.clearStoredVersion()`

Clears the stored value from `localStorage`.

## Options

| Option        | Type                                  | Default        | Description                                                         |
| ------------- | ------------------------------------- | -------------- | ------------------------------------------------------------------- |
| `htmlFileUrl` | `string`                              | Required       | Entry HTML URL to check, usually `/` or `import.meta.env.BASE_URL`. |
| `appEtagKey`  | `string`                              | `__APP_ETAG__` | `localStorage` key used to store the latest known value.            |
| `interval`    | `number`                              | `120000`       | Polling interval in milliseconds.                                   |
| `immediate`   | `boolean`                             | `true`         | Whether to check immediately after polling starts.                  |
| `silent`      | `boolean`                             | `false`        | Disable update checks when set to `true`.                           |
| `headerName`  | `'etag' \| 'last-modified' \| string` | `etag`         | Response header used for version comparison.                        |
| `onUpdate`    | `(updater, payload) => void`          | `undefined`    | Called when a different header value is detected.                   |
| `onError`     | `(error) => void`                     | `undefined`    | Called when the initial request or worker request fails.            |

## Notes

- This package only runs in browsers.
- Your server should return a stable `etag` header for the entry HTML.
- If `etag` is unavailable, use `headerName: 'last-modified'`.
- Avoid strong caching for the entry HTML, otherwise the check may not see new
  deployments.
- The worker is created from an inline Blob, so no extra worker file or static asset
  configuration is required.
