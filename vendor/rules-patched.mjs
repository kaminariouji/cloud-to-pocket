// A patched rule engine, written as a wrapper so vendor/rules.mjs stays untouched.
// Every extra check below is traced to a measured miss in MIGRATION.md.
// Deliberately written without regular expressions: string tests are easier to
// audit and this file is the one that changed after the benchmark ran.
import { analyzeRules as base } from './rules.mjs'

const SECRET_WORDS = ['password', 'pin', 'passcode', 'tac', 'otp']
const NOTICE_WORDS = ['was changed', 'was updated', 'was reset', 'has been changed', 'has been updated', 'have been changed', 'have been updated']
const MONEY_VERBS = ['pay ', 'transfer ', 'send ']
const CURRENCY_WORDS = ['rm', 'usd', 'sgd', 'idr', '$']
const FEE_WORDS = ['insurance payment', 'insurance fee', 'storage fee', 'release fee', 'clearance fee', 'processing fee', 'activation fee']
const NEW_NUMBER = ['new number', 'changed my number', 'this is my new']

const hasDigit = (s) => Array.from(s).some((c) => c >= '0' && c <= '9')
const lower = (s) => String(s || '').toLowerCase()

// "pay RM 2,000", "transfer 900", "pay $45"
function asksForAmount (text) {
  const t = lower(text)
  for (const verb of MONEY_VERBS) {
    let i = t.indexOf(verb)
    while (i !== -1) {
      const tail = t.slice(i + verb.length, i + verb.length + 14)
      if (hasDigit(tail) && CURRENCY_WORDS.some((c) => tail.includes(c))) return true
      if (hasDigit(tail) && /^[0-9]/.test(tail.trim())) return true
      i = t.indexOf(verb, i + 1)
    }
  }
  return false
}

function band (score) {
  return score >= 55 ? 'high' : score >= 25 ? 'caution' : 'low'
}

export function analyzeRules (text) {
  const t = lower(text)
  const r = base(text)
  let hits = r.hits.slice()

  // 1. "Your password was updated" is a notice, not a request for a secret.
  const namesSecret = SECRET_WORDS.some((w) => t.includes(w))
  const isNotice = NOTICE_WORDS.some((w) => t.includes(w))
  if (namesSecret && isNotice) hits = hits.filter((h) => h.id !== 'credentials')

  // 2. "fixed deposit" contains the word deposit but asks for nothing.
  if (t.includes('fixed deposit') && !asksForAmount(text)) {
    hits = hits.filter((h) => h.id !== 'money_request' && h.id !== 'advance_fee')
  }

  // 3. Money asks the original pattern missed: a stated amount, or a named fee.
  const alreadyAsked = hits.some((h) => h.id === 'money_request')
  if (!alreadyAsked) {
    if (asksForAmount(text)) {
      hits.push({ id: 'pay_amount', label: 'Asks you to pay or transfer a stated amount', weight: 26 })
    } else if (FEE_WORDS.some((w) => t.includes(w))) {
      hits.push({ id: 'fee_kind', label: 'Names a fee that has to be paid first', weight: 26 })
    }
  }

  // 4. A stranger on a "new number" asking for money is family impersonation.
  if (NEW_NUMBER.some((w) => t.includes(w)) && (alreadyAsked || asksForAmount(text))) {
    hits.push({ id: 'new_number', label: 'Claims to be someone you know, writing from a new number', weight: 26 })
  }

  const score = Math.min(100, hits.reduce((a, h) => a + h.weight, 0))
  return { ...r, hits, score, verdict: band(score) }
}
