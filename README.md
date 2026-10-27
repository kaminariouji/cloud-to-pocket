# Cloud to Pocket

A measured migration of one AI workload — *"is this message a scam?"* — from a hosted
chat model to a device that never opens a socket.

This repository is the benchmark harness and the report, not a demo app. It answers a
narrow question with numbers: **when you move message triage off the cloud, what exactly
do you lose and what do you keep?**

Built for the [AI Yako: Own Your AI hackathon](https://dorahacks.io/hackathon/2452),
track *Cloud to Pocket*.

## The workload

Every day people paste suspicious SMS, WhatsApp and email text into a cloud assistant
and ask whether it is a scam. That is a real workflow with a real cost: the message,
the phone number and every link leave the device, the answer takes seconds, and with no
connection there is no answer at all.

Three configurations are measured on the same 40 messages:

| arm | who decides | network |
|---|---|---|
| `cloud` | hosted chat model, one request per message | 384 bytes uploaded per message |
| `device-rules` | deterministic rule engine in [Scam Shield Offline](https://github.com/kaminariouji/scam-shield-offline) | none |
| `device-model` | same rule engine, plus the local Llama 3.2 1B adjudicating everything the rules do not call `high` | none |

## Results

40 messages, 20 scams across nine families and 20 legitimate messages that include
near-misses (a real OTP alert, a real courier notice, a real invoice with a link).

| arm | accuracy | false pos | false neg | p50 | p95 | peak RSS | uploaded |
|---|---|---|---|---|---|---|---|
| cloud | **97.4%** (38/39 answered) | 1 | 0 | 1,136 ms | 13,845 ms | 81 MB | 384 B/msg |
| device-rules | 82.5% (33/40) | 2 | 5 | **0.009 ms** | 0.69 ms | 64 MB | **0 B** |
| device-model | 17.5% (7/40) | 11 | 0 | 917 ms | 1,160 ms | 92 MB | **0 B** |

Full breakdown, including the five device misses and why they happen: [MIGRATION.md](MIGRATION.md).

## The finding that matters

Putting a 1B model in the classifier seat does not close the gap — it destroys the
system. Asked to judge a scam message directly, the model either refuses
(*"I can't assist with fraudulent activity"*) or collapses to a single class. 26 of 40
answers were unusable. This is the same failure that made Scam Shield keep the model out
of the decision: the model explains flags the rules already found, it never reads the
message.

So the honest tradeoff is not "cloud accuracy, offline". It is:

- the device gives up **15 points of accuracy** and 0.4 s of p95 latency for a decision
  that is **125,000× faster** at the median, uploads **nothing**, and still answers with
  the network cable pulled;
- the cloud gives up **availability and privacy**: in this run 15 of 40 requests were
  rate-limited, one never answered, and the worst answer took 22.8 seconds.

## Reproduce

```bash
npm install                 # @qvac/sdk for the device-model arm
npm run bench:rules         # device-rules arm, no model, ~0.1 s
npm run bench:cloud         # cloud arm, needs AGNES_API_KEY in the environment
npm run bench:model         # device-model arm, downloads a 1B model once
node bench/report.mjs       # prints the tables above from the files in results/
```

The cloud arm reads `AGNES_API_KEY` from the environment. Nothing else in the repository
touches the network.

## What is in here

- `bench/set.jsonl` — the 40 labelled messages, one JSON object per line
- `bench/run-cloud.mjs` — cloud arm, records latency, tokens and uploaded bytes per message
- `bench/run-device.mjs` — rules-only arm
- `bench/run-device2.mjs` — rules plus local-model adjudication
- `bench/report.mjs` — recomputes every number in this README from the result files
- `vendor/rules.mjs` — the rule engine from Scam Shield Offline, MIT, unmodified
- `results/*.json` — raw per-message output of all three arms

## Limits of this study

- 40 messages, labelled by the author. It is a sanity benchmark, not a public corpus.
- The rule engine was written before this set existed, but both come from the same
  author, so a shared blind spot is possible.
- One cloud model, one run, one machine (Ryzen 5 3600X, 32 GB RAM, CPU only).
- Latency for the cloud arm includes queueing at a free-tier endpoint; the p95 is
  therefore a property of *that* endpoint, not of hosted inference in general.

## Licence

MIT.
