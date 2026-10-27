// Second device configuration: the rule engine decides the clear cases, and the
// local 1B model is asked only about the ones the rules cannot settle. Nothing
// leaves the machine in either branch.
import { readFileSync, writeFileSync } from 'node:fs'
import { analyzeRules } from '../vendor/rules.mjs'
import { loadModel, completion, unloadModel, LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk'

const SET = new URL('./set.jsonl', import.meta.url)
const OUT = new URL('./results-device2.json', import.meta.url)
const rows = readFileSync(SET, 'utf8').trim().split('\n').map((l) => JSON.parse(l))

const SYSTEM = [
  'You are a fraud triage classifier.',
  'Read the message and answer with exactly one word: SCAM or LEGIT.',
  'A real bank, courier, telecom or government office never asks for a PIN, an OTP, a password or a seed phrase, and never asks for a fee to release money or a parcel.'
].join(' ')

const tLoad0 = Date.now()
const modelId = await loadModel({
  modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  modelType: 'llm',
  modelConfig: { ctx_size: 2048, gpu_layers: 0, device: 'cpu' }
})
const loadMs = Date.now() - tLoad0

const out = []
let peakRss = 0
let modelCalls = 0

for (const row of rows) {
  const t0 = process.hrtime.bigint()
  const r = analyzeRules(row.text)
  let verdict
  let via = 'rules'
  let answer = null
  if (r.verdict === 'high') {
    verdict = 'scam'
  } else {
    via = 'model'
    modelCalls++
    const res = completion({
      modelId,
      history: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: row.text }
      ],
      stream: true,
      generationParams: { temp: 0, top_p: 0.9, predict: 8 }
    })
    answer = ''
    for await (const tok of res.tokenStream) answer += tok
    const m = answer.match(/scam|legit/i)
    verdict = m ? (m[0].toLowerCase() === 'scam' ? 'scam' : 'legit') : 'unparsed'
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  peakRss = Math.max(peakRss, process.memoryUsage().rss)
  out.push({ id: row.id, label: row.label, family: row.family, verdict, via, score: r.score, band: r.verdict, ms, answer: answer ? answer.trim().slice(0, 40) : null })
  process.stdout.write(via === 'rules' ? 'R' : verdict === 'scam' ? 's' : verdict === 'legit' ? 'l' : 'x')
}

await unloadModel({ modelId })

const correct = out.filter((r) => r.verdict === r.label).length
const lat = out.map((r) => r.ms).sort((a, b) => a - b)
const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))]
const summary = {
  system: 'device (rules + local Llama 3.2 1B adjudicating the non-high band)',
  n: out.length,
  correct,
  accuracy: +(correct / out.length).toFixed(4),
  decided_by_rules: out.filter((r) => r.via === 'rules').length,
  decided_by_model: modelCalls,
  model_load_ms: loadMs,
  falsePositives: out.filter((r) => r.label === 'legit' && r.verdict === 'scam').length,
  falseNegatives: out.filter((r) => r.label === 'scam' && r.verdict === 'legit').length,
  ms_p50: +p(0.5).toFixed(0),
  ms_p95: +p(0.95).toFixed(0),
  ms_max: +lat[lat.length - 1].toFixed(0),
  peak_rss_mb: +(peakRss / 1048576).toFixed(1),
  network_bytes_per_message: 0,
  errors: out.filter((r) => r.verdict !== r.label).map((r) => ({ id: r.id, label: r.label, verdict: r.verdict, via: r.via, score: r.score, answer: r.answer }))
}
writeFileSync(OUT, JSON.stringify({ summary, rows: out }, null, 1))
console.log('\n' + JSON.stringify(summary, null, 1))
