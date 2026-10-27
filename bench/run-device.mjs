// Device side of the migration study: the same classification task, run entirely
// on this machine with the deterministic rule engine that ships in Scam Shield.
// No network calls. The only measurement that touches the network is none.
import { readFileSync, writeFileSync } from 'node:fs'
import { analyzeRules } from '../vendor/rules.mjs'

const SET = new URL('./set.jsonl', import.meta.url)
const OUT = new URL('./results-device.json', import.meta.url)

const rows = readFileSync(SET, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const out = []
let peakRss = 0

for (const row of rows) {
  const t0 = process.hrtime.bigint()
  const r = analyzeRules(row.text)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  const verdict = r.verdict === 'low' ? 'legit' : 'scam'
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
  out.push({ id: row.id, label: row.label, family: row.family, verdict, score: r.score, band: r.verdict, ms, topFlag: r.hits[0] ? r.hits[0].label : null })
}

const correct = out.filter((r) => r.verdict === r.label).length
const lat = out.map((r) => r.ms).sort((a, b) => a - b)
const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))]
const fp = out.filter((r) => r.label === 'legit' && r.verdict === 'scam')
const fn = out.filter((r) => r.label === 'scam' && r.verdict === 'legit')

const summary = {
  system: 'device (rule engine, no model call)',
  n: out.length,
  correct,
  accuracy: +(correct / out.length).toFixed(4),
  falsePositives: fp.length,
  falseNegatives: fn.length,
  ms_p50: +p(0.5).toFixed(3),
  ms_p95: +p(0.95).toFixed(3),
  ms_max: +lat[lat.length - 1].toFixed(3),
  peak_rss_mb: +(peakRss / 1048576).toFixed(1),
  network_bytes_per_message: 0,
  notes: fp.concat(fn).map((r) => ({ id: r.id, label: r.label, verdict: r.verdict, score: r.score, topFlag: r.topFlag }))
}

writeFileSync(OUT, JSON.stringify({ summary, rows: out }, null, 1))
console.log(JSON.stringify(summary, null, 1))
