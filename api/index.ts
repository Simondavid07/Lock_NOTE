import { createLocknoteRuntime } from '../server/src/runtime'

let app: any

export default function handler(req: any, res: any) {
  if (!app) {
    app = createLocknoteRuntime({ requireSupabase: false }).app
  }
  return app(req, res)
}
