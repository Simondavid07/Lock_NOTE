import { createLocknoteRuntime } from '../server/src/runtime'

const runtime = createLocknoteRuntime({ requireSupabase: false })

export default function handler(req: any, res: any) {
  return runtime.app(req, res)
}
