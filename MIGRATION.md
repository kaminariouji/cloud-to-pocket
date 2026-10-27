# Migrating message triage from a cloud assistant to the device

This is the measurement behind [Cloud to Pocket](README.md). One workload, three
implementations, two message sets, every number reproducible with `node bench/report.mjs`.

## 1. The original workflow

A person receives a suspicious message and does this:

1. copies the text, including the sender number and every link;
2. pastes it into a cloud assistant;
3. asks *"is this a scam?"*;
4. reads a paragraph and decides.

What that costs, measured on 40 messages against `agnes-3.0-flash` at temperature 0:

| | measured |
|---|---|
| bytes of the message that leave the device | **384 per message** |
| round trips per answer | 1 (plus retries) |
| median latency | **1,136 ms** |
| p95 latency | **13,845 ms** |
| worst case in the run | 22,764 ms |
| requests rate-limited during 40 messages | **15** |
| messages that got no answer at all | 1 |
| tokens billed per message | 150.6 |
| works with no connection | **no** |

The number that matters for fraud is not the median. It is the p95 and the one message
that never got an answer: a person under pressure, on a bad connection, at 11pm.

## 2. What moved

| piece | before | after |
|---|---|---|
| decision | hosted chat model | deterministic rule engine, on device |
| explanation | the same cloud answer | local Llama 3.2 1B (Q4_0) explaining the flags the rules already found |
| message text | uploaded | never leaves the process |
| model weights | on the provider's server | 773 MB on local disk, loaded once, 30.6 s cold start |
| failure mode | no network, no answer | no network, same answer |

The rule engine is [`vendor/rules.mjs`](vendor/rules.mjs), taken unmodified from
[Scam Shield Offline](https://github.com/kaminariouji/scam-shield-offline) (MIT). The
patched variant is [`vendor/rules-patched.mjs`](vendor/rules-patched-v2.mjs), a
wrapper that adds four checks and two guards without touching the original file.

## 3. Quality

Set 1 is 40 messages: 20 scams across nine families, 20 legitimate messages that include
near-misses (a real OTP alert, a real courier notice, a real invoice with a link).
Set 2 is 20 further messages written afterwards, never used to design any rule.

| arm | set 1 (40) | set 2, held out (20) |
|---|---|---|
| cloud model | **95.0%** (38/40, one request never answered) | **90.0%** (18/20) |
| device, rules as shipped | 82.5% (33/40) | 65.0% (13/20) |
| device, rules patched | **95.0%** (38/40) | **85.0%** (17/20) |
| device, rules + 1B model adjudicating | 17.5% (7/40) | not run |

Confusion counts:

| arm | set 1 FP / FN | set 2 FP / FN |
|---|---|---|
| cloud | 1 / 0 | 2 / 0 |
| device, rules as shipped | 2 / 5 | 1 / 6 |
| device, rules patched | 0 / 2 | 0 / 3 |
| device, rules + 1B model | 11 / 0 | - |

### Why the 1B model made it worse, not better

The obvious way to close a 15-point gap is to put the model in the classifier seat. It
fails. Asked to judge a scam message directly, Llama 3.2 1B does one of three things:

- **refuses**: "I can't assist with fraudulent activity." (5 of 38 model calls)
- **collapses to one class**: 18 scam verdicts, 11 of them on legitimate messages
- **answers something else entirely**: "One." on 15 calls, "NO" once, "2" once

22 of 40 answers were unusable and 11 legitimate messages were called scams, so accuracy
fell to 17.5%. This is the failure mode the shipped product was designed around: the model
never reads the message, it only explains flags the rules already found. A 1B model can
write two sentences about "a link using a look-alike courier domain". It cannot be trusted
to decide whether a message is fraud.

### Where the device actually lost points

Every miss in the shipped rules traced to a specific, fixable gap. All of them were found
on set 1 and fixed generically, then measured on set 2 without further changes:

| miss | what the message said | why the rules missed it |
|---|---|---|
| s11 | "this is my new number ... transfer RM 900" | the money pattern only knew `transfer ke` (Malay), not `transfer <amount>` |
| s12 | "only a RM 350 insurance payment is needed" | `payment` alone never matched; the pattern wanted `pay a fee` |
| s14 | tax refund plus a `.click` host | two link flags scored 24, one point under the `caution` threshold of 25 |
| s18 | food-delivery link on a `.top` host | a single weak link flag scored 12 |
| s19 | "Pay RM 2,000 settlement to this account" | a currency code between `pay` and the amount broke the pattern |
| l07 (false positive) | "your fixed deposit matures" | `deposit` is a money word even inside `fixed deposit` |
| l17 (false positive) | "your password was changed" | `password` is a secret word even in a notice that asks for nothing |

The patched wrapper fixes the money-ask shapes, adds a new-number impersonation check, and
adds the two guards. Held-out accuracy went from **65.0% to 85.0%**, and false positives on
both sets went to zero. Three misses remain on held-out data, all of the same kind: a scam
whose only signal is one weak link flag (h05, h06), or a Malay-language fee word the
patterns do not carry (h02, `yuran pemprosesan`).

## 4. Speed

| arm | p50 | p95 | max |
|---|---|---|---|
| cloud | 1,136 ms | 13,845 ms | 22,764 ms |
| device, rules only | **0.009 ms** | 0.69 ms | 2.4 ms |
| device, rules + 1B model | 917 ms | 1,160 ms | 1,190 ms |

The rules-only arm is 126,000x faster at the median and 20,000x faster at p95, because it
never leaves the process. Adding the local model costs about 0.9 s per message, the same
order as the cloud, with none of the network risk.

## 5. Memory

| arm | peak RSS | disk |
|---|---|---|
| cloud | 81 MB | none |
| device, rules only | 64 MB | 0 |
| device, rules + 1B model | 92 MB | 773 MB of weights |

The device-model arm is the only one that pays a real memory price, and it is the one that
scored 17.5%. On this workload the model is the expensive part and the least useful part.

## 6. What we would ship

The rules-patched engine, with the model kept strictly in the explanation role. It gives
95% on set 1 and 85% on held-out data for 64 MB and zero uploads, against 95% and 90% for
a cloud call that uploads the message, rate-limits 15 times in 40 requests, and cannot
answer offline. The remaining gap is three rule gaps, not a model problem, and each one is
a five-line fix rather than a bigger model.

## 7. Limits

- Both sets are labelled by the author, 60 messages in total. This is a sanity benchmark,
  not a public corpus.
- The rule engine predates the sets, but the same author wrote all three, so a shared blind
  spot is possible. Set 2 is the honest check on that, and the patch still gained 20 points
  on it.
- One cloud model, one run, one machine (Ryzen 5 3600X, 32 GB RAM, CPU only, no GPU).
- Cloud latency includes queueing at a free-tier endpoint. The p95 is a property of that
  endpoint as much as of hosted inference.
- The engine is English-first; Malay fee vocabulary is only partly covered.

## Reproduce

```bash
node bench/run-device.mjs      # rules as shipped, set 1
node bench/run-cloud2.mjs      # cloud arm, set 1  (needs AGNES_API_KEY)
node bench/run-cloud3.mjs      # cloud arm, set 2
node bench/run-device2.mjs     # rules + 1B model, set 1
node bench/run-patched.mjs set.jsonl
node bench/run-patched.mjs set2.jsonl
node bench/report.mjs          # every table above, recomputed from the result files
```
