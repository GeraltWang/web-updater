export interface WorkerStartOptions {
  appEtagKey: string
  htmlFileUrl: string
  interval: number
  immediate: boolean
  headerName: string
  lastEtag: string | null
}

export type WorkerRequestMessage =
  | {
      code: 'start' | 'resume'
      data: WorkerStartOptions
    }
  | {
      code: 'pause'
    }

export interface WorkerUpdateMessage {
  appEtagKey: string
  lastEtag: string | null
  etag: string | null
}

export interface WorkerErrorMessage {
  error: string
}

export type WorkerResponseMessage = WorkerUpdateMessage | WorkerErrorMessage

type WorkerLikeScope = {
  postMessage: (message: WorkerResponseMessage) => void
  onmessage: ((event: MessageEvent<WorkerRequestMessage>) => void) | null
}

export function createWorker(func: () => void): Worker {
  const blob = new Blob([`(${func.toString()})()`], {
    type: 'application/javascript',
  })
  const url = window.URL.createObjectURL(blob)
  const worker = new Worker(url)

  window.URL.revokeObjectURL(url)

  return worker
}

export function createWorkerFunc(): void {
  let timer: ReturnType<typeof setInterval> | null = null
  let options: WorkerStartOptions | undefined

  const clearTimer = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const workerScope = self as unknown as WorkerLikeScope

  workerScope.onmessage = (event) => {
    const { code } = event.data

    if (code === 'pause') {
      clearTimer()
      return
    }

    options = {
      ...options,
      ...event.data.data,
    }

    const currentOptions = options

    if (!currentOptions) {
      return
    }

    const runRequest = () => {
      fetch(currentOptions.htmlFileUrl, {
        method: 'HEAD',
        cache: 'no-cache',
      })
        .then((response) => {
          const etag = response.headers.get(currentOptions.headerName)

          if (currentOptions.lastEtag !== etag) {
            workerScope.postMessage({
              appEtagKey: currentOptions.appEtagKey,
              lastEtag: currentOptions.lastEtag,
              etag,
            })
          }
        })
        .catch((error: unknown) => {
          workerScope.postMessage({
            error: error instanceof Error ? error.message : String(error),
          })
        })
    }

    clearTimer()

    if (currentOptions.immediate) {
      runRequest()
    }

    timer = setInterval(runRequest, currentOptions.interval)
  }
}

export function closeWorker(worker: Worker): void {
  worker.terminate()
}
