import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const assetDirectory = path.resolve('client/dist/assets')
const maxChunkKilobytes = Number(process.env.LOCKNOTE_MAX_JS_CHUNK_KB ?? 850)

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? filesIn(fullPath) : [fullPath]
  }))
  return nested.flat()
}

const assetFiles = (await filesIn(assetDirectory)).filter((file) => file.endsWith('.js'))
if (assetFiles.length === 0) throw new Error('No built JavaScript assets were found. Run npm run build first.')

const chunks = await Promise.all(assetFiles.map(async (file) => ({
  file: path.relative(process.cwd(), file),
  bytes: (await stat(file)).size,
})))
const largest = chunks.reduce((current, chunk) => chunk.bytes > current.bytes ? chunk : current)
const totalBytes = chunks.reduce((total, chunk) => total + chunk.bytes, 0)
const maximumBytes = maxChunkKilobytes * 1024

console.log(`Bundle budget: ${chunks.length} JavaScript chunks, ${(totalBytes / 1024).toFixed(1)} KiB total, largest ${largest.file} (${(largest.bytes / 1024).toFixed(1)} KiB).`)
if (largest.bytes > maximumBytes) {
  throw new Error(`Bundle budget exceeded: largest chunk is ${(largest.bytes / 1024).toFixed(1)} KiB; limit is ${maxChunkKilobytes} KiB.`)
}
