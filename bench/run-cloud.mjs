// Cloud side of the migration study: the same classification task sent to a
// hosted chat model. This is the workflow the device build replaces.
import { readFileSync, writeFileSync } from 'node:fs'

const SET = new URL('./set.jsonl', import.meta.url)
const OUT = new URL('./results-cloud.json', import.meta.url)
const ENV = 'C:/CRYPTO MONEY MAKER/.env'
const KEY = (readFileSync(ENV, 'utf8').match(/AGNES_API_KEY\s*=\s*(\S+)/) || [])[1]
if (!KEY) throw new Error('AGNES_API_KEY missing')

const MODEL = process.env.CLOUD_MODEL || 'agnes-3.0-flash'
const ENDPOINT = 'https://apihub.agnes-ai.com/v1/chat/completions'
const SYSTEM = 'You are a message triage classifier. Reply with JSON only: {"verdict":"scam"} or {"verdict":"legit"}. No other text.'

const rows = readFileSync(SET, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const out = []
let peakRss = 0

for (const row of rows) {
  const body = JSON.stringify({
    model: MODEL,
    temperature: 0,
    max_tokens: 20,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: row.text }
    ]
  })
  const bytes = Buffer.byteLength(body, 'utf8')
  const t0 = process.hrtime.bigint()
  let verdict = null
  let usage = null
  let status = 0
  let attempts = 0
  for (attempts = 1; attempts <= 3; attempts++) {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
      body,
      signal: AbortSignal.timeout(60000)
    })
    status = r.status
    const t = await r.text()
    if (r.status === 200) {
      const j = JSON.parse(t)
      const content = (j.choices && j.choices[0] && j.choices[0].message.content) || ''
      const m = content.match(/scam|legit/i)
      verdict = m ? m[0].toLowerCase() : 'unparsed'
      usage = j.usage || null
      break
    }
    if (r.status !== 429 && r.status < 500) { verdict = 'http_' + r.status; break }
    await new Promise((res) => setTimeout(res, 1500 * attempts))
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
  out.push({ id: row.id, label: row.label, family: row.family, verdict, ms, status, attempts, request_bytes: bytes, usage })
  process.stdout.write('.')
}

const correct = out.filter((r) => r.verdict === r.label).length
const lat = out.map((r) => r.ms).sort((a, b) => a - b)
const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))]
const fp = out.filter((r) => r.label === 'legit' && r.verdict === 'scam')
const fn = out.filter((r) => r.label === 'scam' && r.verdict === 'legit')
const tokens = out.reduce((a, r) => a + ((r.usage && r.usage.total_tokens) || 0), 0)
const bytesTotal = out.reduce((a, r) => a + r.request_bytes, 0)

const summary = {
  system: 'cloud (' + MODEL + ')',
  n: out.length,
  correct,
  accuracy: +(correct / out.length).toFixed(4),
  falsePositives: fp.length,
  falseNegatives: fn.length,
  unparsed_or_failed: out.filter((r) => !['scam', 'legit'].includes(r.verdict)).length,
  ms_p50: +p(0.5).toFixed(1),
  ms_p95: +p(0.95).toFixed(1),
  ms_max: +lat[lat.length - 1].toFixed(1),
  peak_rss_mb: +(peakRss / 1048576).toFixed(1),
  total_tokens: tokens,
  tokens_per_message: +(tokens / out.length).toFixed(1),
  request_bytes_per_message: Math.round(bytesTotal / out.length),
  retries: out.reduce((a, r) => a + (r.attempts - 1), 0),
  notes: fp.concat(fn).map((r) => ({ id: r.id, label: r.label, verdict: r.verdict }))
}

writeFileSync(OUT, JSON.stringify({ summary, rows: out }, null, 1))
console.log('\n' + JSON.stringify(summary, null, 1))
