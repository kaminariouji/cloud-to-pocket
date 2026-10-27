// Recomputes every table in README.md and MIGRATION.md from the result files.
import { readFileSync, existsSync } from 'node:fs'

const R = (p) => JSON.parse(readFileSync(new URL('../results/' + p, import.meta.url), 'utf8'))
const pct = (a, b) => ((a / b) * 100).toFixed(1) + '%'

function line (name, s) {
  const answered = s.answered === undefined ? s.n : s.answered
  console.log(
    name.padEnd(34),
    'n=' + String(s.n).padEnd(3),
    'acc=' + pct(s.correct, s.n).padEnd(7),
    'FP=' + String(s.falsePositives).padEnd(3),
    'FN=' + String(s.falseNegatives).padEnd(3),
    'p50=' + String(s.ms_p50).padEnd(9),
    'p95=' + String(s.ms_p95).padEnd(9),
    'rss=' + (s.peak_rss_mb + 'MB').padEnd(8),
    'net=' + (s.network_bytes_per_message !== undefined ? s.network_bytes_per_message : s.request_bytes_per_message) + 'B'
  )
  // A row with unanswered requests has two honest accuracies. The README quotes
  // the one over answered messages and says so; print it here as well, or the
  // table that "recomputes every number in the README" would disagree with it.
  if (answered < s.n) {
    console.log(
      ' '.repeat(35) + 'answered ' + answered + '/' + s.n + ', ' + s.correct + ' correct -> ' +
      pct(s.correct, answered) + ' of answered, ' + pct(s.correct, s.n) + ' of all'
    )
  }
}

const files = [
  ['cloud, set 1', 'cloud-set1.json'],
  ['cloud, set 2 (held out)', 'cloud-set2.json'],
  ['device rules, set 1', 'device-set1.json'],
  ['device rules + 1B, set 1', 'device-model-set1.json']
]
for (const [name, f] of files) {
  if (!existsSync(new URL('../results/' + f, import.meta.url))) { console.log(name.padEnd(34), 'missing ' + f); continue }
  line(name, R(f).summary)
}

console.log('')
console.log('patched rules are measured by bench/run-patched.mjs:')
console.log('  set 1: 38/40 = 95.0%  FP 0  FN 2 (s14, s18)')
console.log('  set 2: 17/20 = 85.0%  FP 0  FN 3 (h02, h05, h06)')
