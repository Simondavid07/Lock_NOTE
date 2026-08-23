export default async function handler(req: any, res: any) {
  try {
    const { createLocknoteRuntime } = await import('../server/src/runtime.js')
    const runtime = createLocknoteRuntime({ requireSupabase: false })
    return runtime.app(req, res)
  } catch (err: any) {
    return res.status(200).json({
      error: 'serverless_bootstrap_error',
      message: err?.message || String(err),
      stack: err?.stack || null,
    })
  }
}
