import { createLocknoteRuntime } from '../server/dist/runtime.js'

const runtime = createLocknoteRuntime({ requireSupabase: false })

export default function handler(req: any, res: any) {
  return runtime.app(req, res)
}
