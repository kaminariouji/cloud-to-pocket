// Generates vendor/rules-patched.mjs from vendor/rules.mjs.
// Five documented changes, each traced to a measured miss in MIGRATION.md.
import { readFileSync, writeFileSync } from 'node:fs'
const SRC = new URL('../vendor/rules.mjs', import.meta.url)
const OUT = new URL('../vendor/rules-patched.mjs', import.meta.url)
let s = readFileSync(SRC, 'utf8').replace(/
/g, '
')
const before = s

// 1. money_request missed "insurance payment", "pay RM 2,000" and "transfer RM 900".
s = s.replace(
  "|\\bpay (?:now|a fee|the fee|\\d|to (?:unlock|release|activate))",
  "|\\bpay (?:now|a fee|the fee|\\d|(?:rm|usd|sgd|idr|\\$)\\s?[\\d,]+|to (?:unlock|release|activate))"
)
s = s.replace(
  "|\\btransfer ke\\b)",
  "|\\btransfer ke\\b|\\btransfer (?:rm|usd|sgd|idr|\\$)?\\s?[\\d,]+|\\binsurance (?:payment|fee)\\b|\\bstorage fee\\b|\\brelease fee\\b)"
)

// 2. "fixed deposit matures" is not a request for money.
s = s.replace("|\\bdeposit\\b", "|(?<!fixed )\\bdeposit\\b")

// 3. A password that was *changed* is a notice, not a request for a secret.
s = s.replace(
  "export function analyzeRules (text) {",
  "const SECRET_NOTICE = /\\b(?:password|pin|passcode|tac|otp)\\b[^.]{0,60}\\b(?:was|has been|have been)\\s+(?:changed|updated|reset|created|set)\\b/i\n\nexport function analyzeRules (text) {\n  const secretNotice = SECRET_NOTICE.test(text)"
)
s = s.replace(
  "  for (const r of RULES) {\n    if (r.re.test(text)) {",
  "  for (const r of RULES) {\n    if (r.id === 'credentials' && secretNotice) continue\n    if (r.re.test(text)) {"
)

// 4. A "new number" plus a money request is a family-impersonation pattern.
s = s.replace(
  "  if (has('impersonation') && has('credentials')) {",
  "  if (/\\bnew number\\b|\\bchanged my number\\b|\\bthis is my new\\b/i.test(text) && has('money_request')) {\n    hits.push({ id: 'new_number', label: 'A stranger claiming to be someone you know, asking for money from a new number', weight: 26 })\n    score += 26\n  }\n  if (has('impersonation') && has('credentials')) {"
)

// 5. One low-reputation TLD alone is weak; two independent link red flags are not.
s = s.replace(
  "      const w = Math.min(30, l.flags.length * 12)",
  "      const w = Math.min(30, l.flags.length * 16)"
)

if (s === before) throw new Error('no change applied')
writeFileSync(OUT, s)
console.log('written', OUT.pathname, s.length, 'bytes')
