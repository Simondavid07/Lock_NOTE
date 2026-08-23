import { createLocknoteRuntime } from '../server/src/runtime.js'

const runtime = createLocknoteRuntime({ requireSupabase: false })

export default runtime.app
