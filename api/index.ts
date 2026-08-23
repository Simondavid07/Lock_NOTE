import { createLocknoteRuntime } from '../server/src/runtime.js'

const runtime = createLocknoteRuntime({ requireSupabase: true })

export default runtime.app
