// Deterministic first pass. Runs in microseconds, no model needed.
// Patterns deliberately avoid a trailing \b so that matches ending in
// punctuation ("Congratulations!") still fire.

const RULES = [
  {
    id: 'credentials',
    weight: 40,
    label: 'Asks for a PIN, OTP, password or seed phrase',
    re: /\b(?:pin|otp|one[- ]time (?:code|password)|password|passcode|cvv|seed phrase|recovery phrase|private key)\b/i
  },
  {
    id: 'urgency',
    weight: 14,
    label: 'Creates artificial urgency or a deadline',
    re: /\b(?:urgent|immediately|right now|act now|final warning|last chance|within \d+ ?(?:hours?|minutes?|hrs?)|expires? (?:today|in \d+)|haraka|sasa hivi|segera|secepatnya|hari ini juga)\b/i
  },
  {
    id: 'prize',
    weight: 22,
    label: 'Claims you won or were selected for something you never applied to',
    re: /(?:\byou (?:have )?won\b|\byou are a winner\b|\byou (?:have been|were) selected\b|congratulations|\blottery\b|\bjackpot\b|\bclaim your (?:prize|reward|bonus)\b|\blucky (?:winner|number)\b|\bumeshinda\b|\bzawadi\b|\banda (?:menang|beruntung)\b|\bhadiah\b)/i
  },
  {
    id: 'money_request',
    weight: 26,
    label: 'Asks you to send money or pay a fee to unlock something',
    re: /(?:\bsend (?:money|cash|funds|\d|your (?:id|details))\b|\bpay (?:now|a fee|the fee|\d|to (?:unlock|release|activate))|\bregistration fee\b|\bactivation fee\b|\bprocessing fee\b|\bclearance fee\b|\bcustoms fee\b|\bdeposit\b|\btop ?up\b|\btuma (?:pesa|hela)\b|\blipa\b|\bkirim (?:uang|dana)\b|\btransfer ke\b)/i
  },
  {
    id: 'impersonation',
    weight: 18,
    label: 'Impersonates a bank, telco, courier or government office',
    re: /\b(?:m-?pesa|safaricom|airtel|equity bank|kcb|co-?op bank|absa|ncba|kra|paybill|till number|customer care|dhl|fedex|posta|postal corporation|bank security|huduma)\b/i
  },
  {
    id: 'crypto_promise',
    weight: 24,
    label: 'Promises guaranteed profit or doubles your money',
    re: /(?:\bguaranteed (?:profit|returns?|income)\b|\bdouble your (?:money|investment)\b|\brisk[- ]free (?:profit|investment)\b|\bforex (?:bot|signal)\b|\bbinary options\b|\bmining contract\b|\bpassive income guaranteed\b|\buntung pasti\b|\bprofit dijamin\b)/i
  },
  {
    id: 'generic_greeting',
    weight: 8,
    label: 'Generic greeting instead of your name',
    re: /^(?:dear (?:customer|user|client|member|winner|applicant)|hello (?:customer|user|sir or madam)|attention:? (?:customer|user))/i
  },
  {
    id: 'secrecy',
    weight: 16,
    label: 'Asks you to keep it secret or not tell anyone',
    re: /(?:\bdo not (?:tell|share|disclose)\b|\bkeep (?:this|it) (?:secret|confidential)\b|\bbetween (?:you and me|us)\b|\busimwambie\b|\bjangan (?:bilang|beri tahu)\b)/i
  },
  {
    id: 'account_threat',
    weight: 20,
    label: 'Threatens that your account will be closed or suspended',
    re: /(?:\baccount (?:will be|has been) (?:suspended|closed|blocked|locked|deactivated)\b|\bunauthori[sz]ed (?:login|access|transaction)\b|\bverify your (?:account|identity) (?:now|immediately)\b|\bakaunti yako\b|\bakun anda (?:diblokir|ditangguhkan)\b)/i
  }
]

const SHORTENERS = new Set(['bit.ly','tinyurl.com','t.co','cutt.ly','rb.gy','shorturl.at','is.gd','goo.gl','ow.ly','t.me','wa.me','linktr.ee','rebrand.ly','tiny.cc','s.id','bit.do'])
const BAD_TLDS = ['.top','.xyz','.click','.zip','.mov','.country','.gq','.tk','.ml','.cf','.work','.rest','.buzz','.loan','.win']
const BRANDS = ['safaricom','mpesa','m-pesa','airtel','equity','kcb','coop','ncba','absa','kra','dhl','fedex','postal','paypal','binance','netflix','amazon','microsoft','apple','google','whatsapp','facebook','instagram']
const OFFICIAL = ['safaricom.co.ke','m-pesa.safaricom.co.ke','airtel.co.ke','equitybank.co.ke','kcbgroup.com','kra.go.ke','dhl.com','fedex.com','paypal.com','binance.com','netflix.com','amazon.com','microsoft.com','apple.com','google.com','whatsapp.com','facebook.com','instagram.com']

function extractLinks (text) {
  const out = []
  const re = /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,;!?)]*)?)/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/[.,;:]+$/, '')
    if (/@/.test(raw)) continue
    if (/^\d+(\.\d+)*$/.test(raw)) continue
    out.push(raw)
  }
  return [...new Set(out)]
}

function inspectLink (raw) {
  const clean = raw.replace(/^https?:\/\//i, '').toLowerCase()
  const host = clean.split('/')[0]
  const flags = []
  if (SHORTENERS.has(host)) flags.push('shortened link hides the real destination')
  if (host.startsWith('xn--') || host.includes('.xn--')) flags.push('punycode host can imitate another brand')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) flags.push('raw IP address instead of a domain')
  const tld = BAD_TLDS.find((t) => host.endsWith(t))
  if (tld) flags.push('low-reputation TLD ' + tld)
  if (!OFFICIAL.some((o) => host === o || host.endsWith('.' + o))) {
    for (const b of BRANDS) {
      if (host.replace(/-/g, '').includes(b)) {
        flags.push('host mentions "' + b + '" but is not its official domain')
        break
      }
    }
  }
  const hyphens = (host.match(/-/g) || []).length
  if (hyphens >= 2) flags.push('host has ' + hyphens + ' hyphens')
  if (host.length > 34) flags.push('unusually long host')
  return { host, flags }
}

export function analyzeRules (text) {
  const hits = []
  let score = 0
  for (const r of RULES) {
    if (r.re.test(text)) {
      hits.push({ id: r.id, label: r.label, weight: r.weight })
      score += r.weight
    }
  }

  const has = (id) => hits.some((h) => h.id === id)

  // Combinations that are fraud patterns on their own, even when each half
  // looks mild in isolation.
  if (has('prize') && has('money_request')) {
    hits.push({ id: 'advance_fee', label: 'Advance-fee pattern: a reward plus a fee to unlock it', weight: 18 })
    score += 18
  }
  if (has('money_request') && has('crypto_promise')) {
    hits.push({ id: 'investment_fee', label: 'Investment pitch that needs your deposit first', weight: 12 })
    score += 12
  }
  if (has('impersonation') && has('credentials')) {
    hits.push({ id: 'brand_pin', label: 'A known brand asking for a secret it should never need', weight: 10 })
    score += 10
  }

  const links = extractLinks(text).map((raw) => ({ raw, ...inspectLink(raw) }))
  for (const l of links) {
    if (l.flags.length) {
      const w = Math.min(30, l.flags.length * 12)
      hits.push({ id: 'link:' + l.host, label: 'Link ' + l.host + ': ' + l.flags.join(', '), weight: w })
      score += w
    }
  }

  const caps = (text.match(/[A-Z]/g) || []).length
  const letters = (text.match(/[A-Za-z]/g) || []).length
  if (letters > 25 && caps / letters > 0.55) {
    hits.push({ id: 'caps', label: 'Mostly written in capitals', weight: 8 })
    score += 8
  }

  const bangs = (text.match(/!/g) || []).length
  if (bangs >= 4) {
    hits.push({ id: 'bangs', label: 'Excessive exclamation marks', weight: 6 })
    score += 6
  }

  score = Math.min(100, score)
  const verdict = score >= 55 ? 'high' : score >= 25 ? 'caution' : 'low'
  return { score, verdict, hits, links }
}
