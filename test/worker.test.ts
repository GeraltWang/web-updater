import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkerFunc } from '../src/worker'

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createHeaders(value: string, headerName = 'etag'): Headers {
  const headers = new Headers()
  headers.set(headerName, value)

  return headers
}

describe('worker', () => {
  const postMessage = vi.fn()
  const scope = {
    postMessage,
    onmessage: null as ((event: MessageEvent) => void) | null,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    scope.onmessage = null

    vi.stubGlobal('self', scope)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        headers: createHeaders('v2'),
      })),
    )

    createWorkerFunc()
  })

  it('reads etag by default and posts an update when the value changes', async () => {
    scope.onmessage?.({
      data: {
        code: 'start',
        data: {
          appEtagKey: '__APP_ETAG__',
          htmlFileUrl: '/',
          interval: 120000,
          immediate: true,
          headerName: 'etag',
          lastEtag: 'v1',
        },
      },
    } as MessageEvent)

    await flushPromises()

    expect(fetch).toHaveBeenCalledWith('/', {
      method: 'HEAD',
      cache: 'no-cache',
    })
    expect(postMessage).toHaveBeenCalledWith({
      appEtagKey: '__APP_ETAG__',
      lastEtag: 'v1',
      etag: 'v2',
    })
  })

  it('supports last-modified', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      headers: createHeaders('Tue, 26 May 2026 08:00:00 GMT', 'last-modified'),
    } as Response)

    scope.onmessage?.({
      data: {
        code: 'start',
        data: {
          appEtagKey: '__APP_ETAG__',
          htmlFileUrl: '/',
          interval: 120000,
          immediate: true,
          headerName: 'last-modified',
          lastEtag: 'Mon, 25 May 2026 08:00:00 GMT',
        },
      },
    } as MessageEvent)

    await flushPromises()

    expect(postMessage).toHaveBeenCalledWith({
      appEtagKey: '__APP_ETAG__',
      lastEtag: 'Mon, 25 May 2026 08:00:00 GMT',
      etag: 'Tue, 26 May 2026 08:00:00 GMT',
    })
  })

  it('pauses and resumes polling', async () => {
    scope.onmessage?.({
      data: {
        code: 'start',
        data: {
          appEtagKey: '__APP_ETAG__',
          htmlFileUrl: '/',
          interval: 1000,
          immediate: false,
          headerName: 'etag',
          lastEtag: 'v1',
        },
      },
    } as MessageEvent)

    vi.advanceTimersByTime(1000)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)

    scope.onmessage?.({
      data: {
        code: 'pause',
      },
    } as MessageEvent)
    vi.advanceTimersByTime(1000)
    await flushPromises()
    expect(fetch).toHaveBeenCalledTimes(1)

    scope.onmessage?.({
      data: {
        code: 'resume',
        data: {
          appEtagKey: '__APP_ETAG__',
          htmlFileUrl: '/',
          interval: 1000,
          immediate: false,
          headerName: 'etag',
          lastEtag: 'v1',
        },
      },
    } as MessageEvent)
    vi.advanceTimersByTime(1000)
    await flushPromises()

    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
