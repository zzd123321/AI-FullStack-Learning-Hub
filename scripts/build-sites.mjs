import { copyFile, cp, mkdir, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const vitePressOutput = fileURLToPath(
  new URL('../docs/.vitepress/dist/', import.meta.url)
)
const workerSource = fileURLToPath(new URL('../sites/worker.js', import.meta.url))
const outputRoot = fileURLToPath(new URL('../dist/', import.meta.url))
const staticOutput = fileURLToPath(new URL('../dist/static/', import.meta.url))
const serverOutput = fileURLToPath(new URL('../dist/server/', import.meta.url))

await rm(outputRoot, { recursive: true, force: true })
await mkdir(staticOutput, { recursive: true })
await mkdir(serverOutput, { recursive: true })
await cp(vitePressOutput, staticOutput, { recursive: true })
await copyFile(workerSource, `${serverOutput}/index.js`)

console.log(`Sites build prepared from ${projectRoot}`)
