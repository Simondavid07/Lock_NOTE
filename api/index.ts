import { createLocknoteRuntime } from '../server/dist/runtime.js'

const runtime = createLocknoteRuntime({ requireSupabase: false })

export default runtime.app
