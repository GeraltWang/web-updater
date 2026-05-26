import { beforeEach, describe, expect, it, vi } from 'vitest'

const worker = {
  onmessage: null as ((event: MessageEvent) => void) | null,
  postMessage: vi.fn(),
  terminate: vi.fn(),
}

vi.mock('../src/worker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/worker')>()

  return {
    ...actual,
    createWorker: vi.fn(() => worker),
    closeWorker: vi.fn((targetWorker: Worker) => targetWorker.terminate()),
  }
})

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createHeaders(value: string | null, headerName = 'etag'): Headers {
  const headers = new Headers()

  if (value !== null) {
    headers.set(headerName, value)
  }

  return headers
}

describe('WebUpdater', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    worker.onmessage = null

    const storage = new Map<string, string>()
    const reload = vi.fn()
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
        removeItem: vi.fn((key: string) => storage.delete(key)),
      },
      location: {
        reload,
      },
    })
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener,
      removeEventListener,
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        headers: createHeaders('v1'),
      })),
    )
  })

  it('uses etag by default and starts the worker', async () => {
    const { createWebUpdater } = await import('../src/index')

    const updater = createWebUpdater({
      htmlFileUrl: '/',
    })

    await flushPromises()

    expect(updater.options.headerName).toBe('etag')
    expect(fetch).toHaveBeenCalledWith('/', {
      method: 'HEAD',
      cache: 'no-cache',
    })
    expect(window.localStorage.setItem).toHaveBeenCalledWith('__APP_ETAG__', 'v1')
    expect(worker.postMessage).toHaveBeenCalledWith({
      code: 'start',
      data: {
        appEtagKey: '__APP_ETAG__',
        htmlFileUrl: '/',
        interval: 120000,
        immediate: true,
        headerName: 'etag',
        lastEtag: 'v1',
      },
    })
    expect(document.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('supports last-modified when configured', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      headers: createHeaders('Tue, 26 May 2026 08:00:00 GMT', 'last-modified'),
    } as Response)

    const { createWebUpdater } = await import('../src/index')

    createWebUpdater({
      htmlFileUrl: '/',
      headerName: 'last-modified',
    })

    await flushPromises()

    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      '__APP_ETAG__',
      'Tue, 26 May 2026 08:00:00 GMT',
    )
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          headerName: 'last-modified',
        }),
      }),
    )
  })

  it('calls onUpdate and stops when the worker reports a new value', async () => {
    const onUpdate = vi.fn()
    const { createWebUpdater } = await import('../src/index')

    const updater = createWebUpdater({
      htmlFileUrl: '/',
      onUpdate,
    })

    await flushPromises()

    worker.onmessage?.({
      data: {
        appEtagKey: '__APP_ETAG__',
        lastEtag: 'v1',
        etag: 'v2',
      },
    } as MessageEvent)

    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(document.removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    )
    expect(onUpdate).toHaveBeenCalledWith(updater, {
      appEtagKey: '__APP_ETAG__',
      lastEtag: 'v1',
      etag: 'v2',
    })
  })

  it('refreshes with the latest detected value', async () => {
    const { createWebUpdater } = await import('../src/index')

    const updater = createWebUpdater({
      htmlFileUrl: '/',
    })

    await flushPromises()

    worker.onmessage?.({
      data: {
        appEtagKey: '__APP_ETAG__',
        lastEtag: 'v1',
        etag: 'v2',
      },
    } as MessageEvent)
    updater.refresh()

    expect(window.localStorage.setItem).toHaveBeenLastCalledWith('__APP_ETAG__', 'v2')
    expect(window.location.reload).toHaveBeenCalledTimes(1)
  })

  it('clears storage when cancelled', async () => {
    const { createWebUpdater } = await import('../src/index')

    const updater = createWebUpdater({
      htmlFileUrl: '/',
    })

    await flushPromises()
    updater.cancel()

    expect(window.localStorage.removeItem).toHaveBeenCalledWith('__APP_ETAG__')
  })
})
