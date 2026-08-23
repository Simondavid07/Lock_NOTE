const baseUrl = process.env.LOCKNOTE_PRODUCTION_URL ?? 'https://lock-note-sigma.vercel.app'
const response = await fetch(baseUrl, { redirect: 'follow' })

if (!response.ok) throw new Error(`Production homepage returned ${response.status}.`)

const requiredHeaders = [
  'content-security-policy',
  'permissions-policy',
  'x-content-type-options',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'referrer-policy',
]

for (const name of requiredHeaders) {
  if (!response.headers.get(name)) throw new Error(`Production response is missing ${name}.`)
}

const csp = response.headers.get('content-security-policy') ?? ''
for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'self'"]) {
  if (!csp.includes(directive)) throw new Error(`Production CSP is missing required directive: ${directive}.`)
}

console.log(`Production static header check passed for ${response.url}.`)
