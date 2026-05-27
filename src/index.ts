import {
  closeWorker,
  createWorker,
  createWorkerFunc,
  type WorkerResponseMessage,
  type WorkerUpdateMessage,
} from './worker'

export interface UpdatePayload {
  /** The localStorage key used to store the last accepted header value. */
  appEtagKey: string

  /** The header value stored before the worker detected an update. */
  lastEtag: string | null

  /** The latest header value returned by the entry HTML request. */
  etag: string | null
}

export interface RefreshOptions {
  /** Navigate with a version query param instead of calling `location.reload()`. */
  cacheBust?: boolean

  /** Query param name used when `cacheBust` is enabled. */
  cacheBustKey?: string
}

export interface WebUpdaterOptions {
  /** Entry HTML URL to check, usually `/` or `import.meta.env.BASE_URL`. */
  htmlFileUrl: string

  /** localStorage key used to store the latest known header value. */
  appEtagKey?: string

  /** Polling interval in milliseconds. */
  interval?: number

  /** Whether to check immediately after polling starts. */
  immediate?: boolean

  /** Disable update checks when set to `true`. */
  silent?: boolean

  /** Response header used for version comparison, such as `etag` or `last-modified`. */
  headerName?: 'etag' | 'last-modified' | string

  /** Called when a different header value is detected. */
  onUpdate?: (updater: WebUpdater, payload: UpdatePayload) => void

  /** Called when the initial request or worker request fails. */
  onError?: (error: unknown) => void
}

interface ResolvedWebUpdaterOptions {
  /** Entry HTML URL to check, usually `/` or `import.meta.env.BASE_URL`. */
  htmlFileUrl: string

  /** localStorage key used to store the latest known header value. */
  appEtagKey: string

  /** Polling interval in milliseconds. */
  interval: number

  /** Whether to check immediately after polling starts. */
  immediate: boolean

  /** Disable update checks when set to `true`. */
  silent: boolean

  /** Response header used for version comparison, such as `etag` or `last-modified`. */
  headerName: string

  /** Called when a different header value is detected. */
  onUpdate?: (updater: WebUpdater, payload: UpdatePayload) => void

  /** Called when the initial request or worker request fails. */
  onError?: (error: unknown) => void
}

const defaultOptions = {
  appEtagKey: '__APP_ETAG__',
  interval: 1000 * 60 * 2,
  immediate: true,
  silent: false,
  headerName: 'etag',
} satisfies Omit<ResolvedWebUpdaterOptions, 'htmlFileUrl' | 'onUpdate' | 'onError'>

function readStoredEtag(key: string): string | null {
  const storedValue = window.localStorage.getItem(key)

  return storedValue === 'null' ? null : storedValue
}

function isUpdateMessage(message: WorkerResponseMessage): message is WorkerUpdateMessage {
  return 'etag' in message
}

function createCacheBustedUrl(url: string, key: string, value: string): string {
  const cacheBustedUrl = new URL(url)

  cacheBustedUrl.searchParams.set(key, value)

  return cacheBustedUrl.toString()
}

/** Browser updater that polls entry HTML headers to detect frontend deployments. */
export class WebUpdater {
  /** The fully resolved updater options, including default values. */
  readonly options: ResolvedWebUpdaterOptions

  private appEtag: string | null = null
  private worker: Worker | null = null
  private readonly handleVisibilityChange = () => {
    if (!this.worker) {
      return
    }

    this.worker.postMessage({
      code: document.visibilityState === 'hidden' ? 'pause' : 'resume',
      data: {
        appEtagKey: this.options.appEtagKey,
        htmlFileUrl: this.options.htmlFileUrl,
        interval: this.options.interval,
        immediate: this.options.immediate,
        headerName: this.options.headerName,
        lastEtag: readStoredEtag(this.options.appEtagKey),
      },
    })
  }

  /** Creates and starts a WebUpdater instance. */
  constructor(options: WebUpdaterOptions) {
    this.options = {
      ...defaultOptions,
      ...options,
    }

    if (!this.options.htmlFileUrl) {
      throw new Error('htmlFileUrl is required.')
    }

    this.init()
  }

  /** Starts polling the entry HTML for update headers. */
  start(): void {
    if (this.options.silent || this.worker) {
      return
    }

    this.worker = createWorker(createWorkerFunc)
    this.worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const message = event.data

      if (!isUpdateMessage(message)) {
        this.options.onError?.(new Error(message.error))
        return
      }

      if (message.lastEtag !== message.etag) {
        this.appEtag = message.etag
        this.stop()
        this.options.onUpdate?.(this, message)
      }
    }

    this.worker.postMessage({
      code: 'start',
      data: {
        appEtagKey: this.options.appEtagKey,
        htmlFileUrl: this.options.htmlFileUrl,
        interval: this.options.interval,
        immediate: this.options.immediate,
        headerName: this.options.headerName,
        lastEtag: readStoredEtag(this.options.appEtagKey),
      },
    })

    document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  /** Stops polling and terminates the internal worker. */
  stop(): void {
    if (!this.worker) {
      return
    }

    closeWorker(this.worker)
    this.worker = null
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
  }

  /** Stores the latest detected header value and reloads the current page. */
  refresh(options: RefreshOptions = {}): void {
    window.localStorage.setItem(this.options.appEtagKey, String(this.appEtag))

    if (options.cacheBust) {
      window.location.replace(
        createCacheBustedUrl(
          window.location.href,
          options.cacheBustKey ?? '__web_updater__',
          this.appEtag ?? String(Date.now()),
        ),
      )
      return
    }

    window.location.reload()
  }

  /** Stores the latest detected header value without reloading the current page. */
  ignoreCurrentVersion(): void {
    window.localStorage.setItem(this.options.appEtagKey, String(this.appEtag))
  }

  /** Clears the stored header value from localStorage. */
  clearStoredVersion(): void {
    window.localStorage.removeItem(this.options.appEtagKey)
  }

  private async init(): Promise<void> {
    try {
      const response = await fetch(this.options.htmlFileUrl, {
        method: 'HEAD',
        cache: 'no-cache',
      })
      const etag = response.headers.get(this.options.headerName)

      this.appEtag = etag
      window.localStorage.setItem(this.options.appEtagKey, String(etag))
      this.start()
    } catch (error) {
      this.options.onError?.(error)
    }
  }
}

/** Creates and starts a WebUpdater instance. */
export function createWebUpdater(options: WebUpdaterOptions): WebUpdater {
  return new WebUpdater(options)
}
