import { env } from './config.js'
import { startJanitor } from './cleanup.js'
import { createLocknoteRuntime } from './runtime.js'

const runtime = createLocknoteRuntime()

if (runtime.persistence === 'supabase') {
  console.log(`[locknote] backend: supabase (${env.supabaseUrl})`)
} else {
  console.warn(
    '[locknote] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing — running on the in-memory store. Set them in .env for persistent local development.',
  )
}

const stop = startJanitor(runtime.backend)

runtime.app.listen(env.port, () => {
  console.log(`[locknote] api listening on http://localhost:${env.port}`)
})

function shutdown() {
  stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
