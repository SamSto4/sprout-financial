// Lets plain Node run the app's server code for evals, without Next.js or extra dependencies.
// Loaded with `node --import ./evals/register.mjs` (see the "eval" script in package.json).
//
// It teaches Node three things the Next.js bundler normally handles:
// - "@/..." imports point at the project root (the "paths" entry in tsconfig.json),
// - imports written without a file extension resolve to the .ts file,
// - "server-only" is a no-op outside a bundler (the real package throws by design).

import { existsSync, statSync } from "node:fs"
import { registerHooks } from "node:module"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function isFile(file) {
  return existsSync(file) && statSync(file).isFile()
}

function findSource(file) {
  return [file, `${file}.ts`, path.join(file, "index.ts")].find(isFile)
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true }
    }

    let file
    if (specifier.startsWith("@/")) {
      file = path.join(root, specifier.slice(2))
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:") &&
      !context.parentURL.includes("/node_modules/")
    ) {
      file = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
    }

    const source = file && findSource(file)
    if (!source) return nextResolve(specifier, context)
    // Naming the format saves Node from guessing it (and from printing a warning about guessing).
    const format = source.endsWith(".ts") ? { format: "module-typescript" } : {}
    return { url: pathToFileURL(source).href, shortCircuit: true, ...format }
  },
})
