import { copyFile, cp, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const vitePressOutput = fileURLToPath(
  new URL('../docs/.vitepress/dist/', import.meta.url)
)
const workerSource = fileURLToPath(new URL('../sites/worker.js', import.meta.url))
const wranglerSource = fileURLToPath(
  new URL('../sites/wrangler.json', import.meta.url)
)
const assetsIgnoreSource = fileURLToPath(
  new URL('../sites/.assetsignore', import.meta.url)
)
const headersSource = fileURLToPath(new URL('../sites/_headers', import.meta.url))
const outputRoot = fileURLToPath(new URL('../dist/', import.meta.url))
const clientOutput = fileURLToPath(new URL('../dist/client/', import.meta.url))
const serverOutput = fileURLToPath(new URL('../dist/server/', import.meta.url))

await rm(outputRoot, { recursive: true, force: true })
await mkdir(clientOutput, { recursive: true })
await mkdir(serverOutput, { recursive: true })
await cp(vitePressOutput, clientOutput, { recursive: true })
await copyFile(workerSource, `${serverOutput}/index.js`)
await copyFile(wranglerSource, `${serverOutput}/wrangler.json`)
await copyFile(assetsIgnoreSource, `${clientOutput}/.assetsignore`)
await copyFile(headersSource, `${clientOutput}/_headers`)

console.log(`Sites build prepared from ${projectRoot}`)
