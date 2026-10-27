
import { readFileSync, writeFileSync } from 'node:fs'
const SET=new URL('./set.jsonl', import.meta.url)
const OUT=new URL('./results-cloud.json', import.meta.url)
const KEY=(readFileSync('C:/CRYPTO MONEY MAKER/.env','utf8').match(/AGNES_API_KEY\s*=\s*(\S+)/)||[])[1]
const MODEL='agnes-3.0-flash', ENDPOINT='https://apihub.agnes-ai.com/v1/chat/completions'
const SYSTEM='You are a message triage classifier. Reply with JSON only: {"verdict":"scam"} or {"verdict":"legit"}. No other text.'
const rows=readFileSync(SET,'utf8').trim().split('\n').map(l=>JSON.parse(l))
const out=[]; let peakRss=0, rateLimited=0
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
for(const row of rows){
  const body=JSON.stringify({model:MODEL,temperature:0,max_tokens:20,messages:[{role:'system',content:SYSTEM},{role:'user',content:row.text}]})
  const bytes=Buffer.byteLength(body,'utf8')
  let verdict=null, usage=null, status=0, attemptMs=null, attempts=0
  for(attempts=1;attempts<=4;attempts++){
    const t0=process.hrtime.bigint()
    const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+KEY},body,signal:AbortSignal.timeout(60000)})
    const t=await r.text()
    attemptMs=Number(process.hrtime.bigint()-t0)/1e6
    status=r.status
    if(r.status===200){ const j=JSON.parse(t); const c=(j.choices&&j.choices[0]&&j.choices[0].message.content)||''
      const m=c.match(/scam|legit/i); verdict=m?m[0].toLowerCase():'unparsed'; usage=j.usage||null; break }
    if(r.status===429){ rateLimited++; await sleep(4000*attempts); continue }
    verdict='http_'+r.status; break
  }
  peakRss=Math.max(peakRss,process.memoryUsage().rss)
  out.push({id:row.id,label:row.label,family:row.family,verdict,ms:attemptMs,status,attempts,request_bytes:bytes,usage})
  process.stdout.write(verdict==='scam'?'s':verdict==='legit'?'l':'x')
  await sleep(1200)
}
const ok=out.filter(r=>['scam','legit'].includes(r.verdict))
const correct=ok.filter(r=>r.verdict===r.label).length
const lat=ok.map(r=>r.ms).sort((a,b)=>a-b); const p=q=>lat[Math.min(lat.length-1,Math.floor(q*lat.length))]
const tokens=ok.reduce((a,r)=>a+((r.usage&&r.usage.total_tokens)||0),0)
const summary={system:'cloud ('+MODEL+')',n:out.length,answered:ok.length,unanswered:out.length-ok.length,rateLimited,correct,accuracy_on_answered:+(correct/ok.length).toFixed(4),accuracy_all:+(correct/out.length).toFixed(4),
 ms_p50:+p(0.5).toFixed(0),ms_p95:+p(0.95).toFixed(0),ms_max:+lat[lat.length-1].toFixed(0),peak_rss_mb:+(peakRss/1048576).toFixed(1),
 total_tokens:tokens,tokens_per_message:+(tokens/ok.length).toFixed(1),request_bytes_per_message:Math.round(ok.reduce((a,r)=>a+r.request_bytes,0)/ok.length),
 falsePositives:ok.filter(r=>r.label==='legit'&&r.verdict==='scam').length,falseNegatives:ok.filter(r=>r.label==='scam'&&r.verdict==='legit').length,
 notes:ok.filter(r=>r.verdict!==r.label).map(r=>({id:r.id,label:r.label,verdict:r.verdict}))}
writeFileSync(OUT,JSON.stringify({summary,rows:out},null,1))
console.log('\n'+JSON.stringify(summary,null,1))
