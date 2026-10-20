/* Admin Performance transcript exports. Timestamps are displayed only when recorded. */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=v=>{if(v===null||v===undefined||v==='')return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString();};
const clock=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0)return '';const t=Math.floor(n);return String(Math.floor(t/3600)).padStart(2,'0')+':'+String(Math.floor(t%3600/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');};
const who=s=>({agent:'Sales Associate',customer:'Customer'}[String(s||'').toLowerCase()]||String(s||'Speaker'));
function messageTime(s,t){
  const iso=s.timestamp||s.started_at||s.start_time||s.time_iso||s.absolute_time;
  if(iso&&typeof iso==='string'&&!/^\d+(?:\.\d+)?$/.test(iso)){const x=stamp(iso);if(x)return x;}
  const raw=s.start_ms??s.offset_ms??s.start_seconds??s.startSeconds??s.start_offset_seconds??s.offset_seconds??s.start??s.offset??s.time;
  if(raw===null||raw===undefined||raw==='')return '';
  if(typeof raw==='string'&&raw.includes(':'))return raw;
  const n=Number(raw);if(!Number.isFinite(n)||n<0)return '';
  // Millisecond offsets are explicitly named; otherwise interpret as seconds.
  const sec=s.start_ms!==undefined?Number(s.start_ms)/1000:s.offset_ms!==undefined?Number(s.offset_ms)/1000:n;
  if(t?.started_at&&Number.isFinite(sec)){const base=new Date(t.started_at);if(!Number.isNaN(base.getTime()))return new Date(base.getTime()+sec*1000).toLocaleTimeString();}
  return clock(sec);
}
function messages(t){
  if(Array.isArray(t?.segments)&&t.segments.length)return t.segments.filter(s=>String(s?.text||'').trim()).map(s=>({speaker:who(s.speaker),time:messageTime(s,t),text:String(s.text)}));
  return String(t?.transcript||'').trim()?[{speaker:'Conversation',time:'',text:String(t.transcript)}]:[];
}
const safeName=v=>String(v||'Call').replace(/[^a-z0-9._-]+/gi,'_').slice(0,75);
const file=(blob,name)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
function textCall(c,metadata=true){
 const meta=metadata?['Lead: '+(c.lead||'Unknown'),'Associate: '+(c.associate||'Unknown'),'Date: '+(stamp(c.date)||'—'),'Outcome: '+(c.outcome||'—'),'Duration: '+(c.duration??'—')].join('\n')+'\n\n':'';
 return meta+messages(c.transcript).map(m=>(m.time?'['+m.time+'] ':'')+m.speaker+': '+m.text).join('\n\n')+'\n';
}
function csv(calls,metadata){
 const rows=[['Call ID','Associate','Lead','Date','Outcome','Duration (seconds)','Speaker','Message time','Message']];
 for(const c of calls){const ms=messages(c.transcript);for(const m of ms.length?ms:[{speaker:'',time:'',text:''}])rows.push([c.id,metadata?c.associate:'',metadata?c.lead:'',metadata?stamp(c.date):'',metadata?c.outcome:'',metadata?c.duration:'',m.speaker,m.time,m.text]);}
 return '\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
}
function printPdf(calls,metadata,opened){
 const win=opened||window.open('','_blank');if(!win)throw Error('Allow popups to export a PDF.');
 const doc='<!doctype html><html><head><meta charset="utf-8"><title>Steady Hands Transcripts</title><style>@page{margin:17mm}body{font:14px/1.5 Arial,sans-serif;color:#183047}header{border-bottom:2px solid #183047;padding-bottom:12px}header small{letter-spacing:2px;color:#596879}article{break-before:page}article:first-of-type{break-before:auto}h2{margin-bottom:4px}.meta{color:#576679;white-space:pre-wrap;margin-bottom:20px}.line{padding:8px 0;border-bottom:1px solid #e2e7ed;break-inside:avoid}.line b{color:#153f79}.line small{color:#687789;margin-left:8px}.line p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}.empty{color:#79818d}@media print{button{display:none}}</style></head><body><header><strong>STEADY HANDS</strong><br><small>CALL TRANSCRIPT REPORT</small></header>'+calls.map(c=>'<article><h2>'+esc(c.lead||'Call')+'</h2>'+(metadata?'<div class="meta">Associate: '+esc(c.associate)+' | '+esc(stamp(c.date))+' | '+esc(c.outcome||'—')+' | '+esc(c.duration??'—')+' seconds</div>':'')+(messages(c.transcript).map(m=>'<section class="line"><b>'+esc(m.speaker)+'</b>'+(m.time?'<small>'+esc(m.time)+'</small>':'')+'<p>'+esc(m.text)+'</p></section>').join('')||'<p class="empty">No saved transcript.</p>')+'</article>').join('')+'<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300));<\/script></body></html>';
 win.document.open();win.document.write(doc);win.document.close();
}
function exportCalls(calls,format,metadata,opened){
 if(!calls.length)throw Error('No matching transcripts to export.');
 if(format==='pdf'){printPdf(calls,metadata,opened);return;}
 const basename='steady-hands-transcripts-'+new Date().toISOString().slice(0,10);
 if(format==='csv')file(new Blob([csv(calls,metadata)],{type:'text/csv;charset=utf-8'}),basename+'.csv');
 else file(new Blob([calls.map(c=>textCall(c,metadata)).join('\n\n'+ '='.repeat(60)+'\n\n')],{type:'text/plain;charset=utf-8'}),basename+'.txt');
}
async function hydrate(rows){
 const client=window.steadyHandsCRMClient;if(!client)throw Error('CRM is unavailable.');
 const ids=[...new Set(rows.map(r=>String(r.id)).filter(Boolean))],transcripts=new Map();
 for(let i=0;i<ids.length;i+=75){
   // Fetch newest transcript for each call; never assume the initial 100 visible calls is the full dataset.
   const {data,error}=await client.from('callcenter_transcripts').select('id,call_activity_id,transcript,segments,started_at,created_at').in('call_activity_id',ids.slice(i,i+75)).order('created_at',{ascending:false});
   if(error)throw error;
   for(const t of data||[])if(!transcripts.has(String(t.call_activity_id)))transcripts.set(String(t.call_activity_id),t);
 }
 return rows.map(r=>({...r,transcript:transcripts.get(String(r.id))||null}));
}
function showBulk(rows){
 const overlay=document.createElement('div');overlay.className='performance-detail-overlay';
 overlay.innerHTML='<section class="performance-export-dialog" role="dialog" aria-modal="true" aria-label="Export transcripts"><div class="performance-export-header"><h2>Export Transcripts</h2><button type="button" data-close aria-label="Close">✕</button></div><p>Export transcripts for your current Performance filters, or all associates.</p><label>Calls to export<select data-scope><option value="filtered">Current Performance filters</option><option value="all">All associates</option></select></label><label>Date range<select data-range><option value="current">Current date filter</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All time</option></select></label><label>Format<select data-format><option value="pdf">PDF (Print / Save as PDF)</option><option value="csv">CSV spreadsheet</option><option value="txt">Plain text (TXT)</option></select></label><label class="performance-export-check"><input type="checkbox" data-meta checked> Include associate, lead, date, duration and outcome</label><label class="performance-export-check"><input type="checkbox" data-empty> Include calls without transcripts</label><p data-count role="status"></p><button class="performance-export-submit" data-export type="button">Export Transcripts</button></section>';
 const dlg=overlay.querySelector('section'),close=()=>overlay.remove();
 const btn=overlay.querySelector('[data-export]'),count=overlay.querySelector('[data-count]');
 const choose=()=>{const scope=overlay.querySelector('[data-scope]').value,range=overlay.querySelector('[data-range]').value, now=Date.now();return (scope==='filtered'?rows.filtered:rows.all).filter(r=>{if(range==='current'||range==='all')return true;return new Date(r.created_at).getTime()>=now-Number(range)*86400000;});};
 const refresh=()=>{count.textContent=choose().length+' calls match the selection; calls without saved transcripts are excluded by default.';};
 overlay.querySelector('[data-close]').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
 overlay.querySelectorAll('select').forEach(el=>el.addEventListener('change',refresh));
 btn.onclick=async()=>{const format=overlay.querySelector('[data-format]').value;const opened=format==='pdf'?window.open('','_blank'):null;if(format==='pdf'&&!opened){count.textContent='Allow popups to export PDF.';return;}if(opened){opened.document.write('<p>Preparing transcript PDF…</p>');}btn.disabled=true;count.textContent='Preparing transcript export…';try{let calls=await hydrate(choose());if(!overlay.querySelector('[data-empty]').checked)calls=calls.filter(c=>messages(c.transcript).length);exportCalls(calls,format,overlay.querySelector('[data-meta]').checked,opened);count.textContent='Prepared '+calls.length+' call(s).'+(overlay.querySelector('[data-format]').value==='pdf'?' Use Print → Save as PDF in the new window.':'');}catch(e){if(opened&&!opened.closed)opened.close();count.textContent='Export failed: '+(e.message||e);}finally{btn.disabled=false;}};
 document.body.append(overlay);refresh();dlg.querySelector('[data-close]').focus();
}
window.SteadyHandsTranscriptExport={
 bulk:(all,filtered)=>showBulk({all,filtered}),
 single:(call,transcript)=>{const c={id:call.id,associate:call.associate,lead:call.lead,date:call.date,outcome:call.outcome,duration:call.duration,transcript};if(!messages(transcript).length)return alert('No transcript was saved for this call.');const format=prompt('Export transcript format: PDF, CSV, or TXT','PDF');if(!format)return;const f=format.trim().toLowerCase();if(!['pdf','csv','txt'].includes(f))return alert('Choose PDF, CSV, or TXT.');try{exportCalls([c],f,true);}catch(e){alert(e.message||e);}},
 time:messageTime
};
})();
