// Test helper: calls one exported function of a module on a worker thread. A test of code that
// could loop forever (a synchronous loop blocks the test's own timeout too) then fails after
// `timeoutMs` instead of hanging the whole `npm test` run. Arguments and the result must be
// plain data (they're copied between threads).

import { Worker } from "node:worker_threads"

const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads")
import(workerData.url).then((mod) => parentPort.postMessage(mod[workerData.name](...workerData.args)))
`

export function callInWorker<T>(moduleUrl: URL, name: string, args: unknown[], timeoutMs = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { url: moduleUrl.href, name, args } })
    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new Error(`${name}() didn't finish within ${timeoutMs} ms`))
    }, timeoutMs)
    worker.once("message", (value: T) => {
      clearTimeout(timer)
      void worker.terminate()
      resolve(value)
    })
    worker.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}
