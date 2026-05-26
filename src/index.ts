import {
  closeWorker,
  createWorker,
  createWorkerFunc,
  type WorkerResponseMessage,
  type WorkerUpdateMessage,
} from './worker'

export interface UpdatePayload {
  appEtagKey: string
  lastEtag: string | null
  etag: string | null
}

export interface WebUpdaterOptions {
  htmlFileUrl: string
  appEtagKey?: string
  interval?: number
  immediate?: boolean
  silent?: boolean
  headerName?: 'etag' | 'last-modified' | string
  onUpdate?: (updater: WebUpdater, payload: UpdatePayload) => void
  onError?: (error: unknown) => void
}

interface ResolvedWebUpdaterOptions {
  htmlFileUrl: string
  appEtagKey: string
  interval: number
  immediate: boolean
  silent: boolean
  headerName: string
  onUpdate?: (updater: WebUpdater, payload: UpdatePayload) => void
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

export class WebUpdater {
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

  stop(): void {
    if (!this.worker) {
      return
    }

    closeWorker(this.worker)
    this.worker = null
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
  }

  refresh(): void {
    window.localStorage.setItem(this.options.appEtagKey, String(this.appEtag))
    window.location.reload()
  }

  cancel(): void {
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

export function createWebUpdater(options: WebUpdaterOptions): WebUpdater {
  return new WebUpdater(options)
}
