// Runs a given rule engine over a given set and prints a compact summary.
import { readFileSync } from 'node:fs'
import { analyzeRules } from '../vendor/rules-patched-v2.mjs'

const setPath = process.argv[2] || 'set.jsonl'
const rows = readFileSync(new URL('./' + setPath, import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const out = rows.map((r) => {
  const a = analyzeRules(r.text)
  const verdict = a.verdict === 'low' ? 'legit' : 'scam'
  return { id: r.id, label: r.label, family: r.family, verdict, score: a.score, band: a.verdict, top: a.hits[0] ? a.hits[0].label : null }
})
const correct = out.filter((r) => r.verdict === r.label).length
const fp = out.filter((r) => r.label === 'legit' && r.verdict === 'scam')
const fn = out.filter((r) => r.label === 'scam' && r.verdict === 'legit')
console.log(setPath, '| n=' + out.length, '| benar=' + correct, '(' + (correct / out.length * 100).toFixed(1) + '%)', '| FP=' + fp.length, '| FN=' + fn.length)
if (fp.length) console.log('  FP:', fp.map((r) => r.id + '(' + r.score + ')').join(', '))
if (fn.length) console.log('  FN:', fn.map((r) => r.id + '(' + r.score + ')').join(', '))
if (process.argv.includes('--all')) for (const r of out) console.log('  ', r.id, r.label, '->', r.verdict, r.score, r.top || '')
