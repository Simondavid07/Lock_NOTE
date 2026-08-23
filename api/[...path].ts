import { createLocknoteRuntime } from '../server/src/runtime.js'

let app: any
let bootstrapError: Error | null = null

function getApp() {
  if (app || bootstrapError) return app

  try {
    app = createLocknoteRuntime({ requireSupabase: false }).app
  } catch (error) {
    bootstrapError = error instanceof Error ? error : new Error('Locknote API initialization failed.')
    console.error('[Locknote] API initialization failed:', bootstrapError.message)
  }

  return app
}

export default function handler(req: any, res: any) {
  const runtimeApp = getApp()
  if (!runtimeApp) {
    return res.status(503).json({
      error: 'service_unavailable',
      message: bootstrapError?.message ?? 'Locknote storage is not configured.',
    })
  }

  return runtimeApp(req, res)
}
