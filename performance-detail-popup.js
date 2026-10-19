/* Native call details popup for Admin Performance, with keyboard and button navigation. */
(() => {
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString();};
  const duration=v=>{const t=Math.max(0,Math.floor(Number(v)||0));return Math.floor(t/60)+'m '+String(t%60).padStart(2,'0')+'s';};
  const field=(k,v)=>'<div><span>'+esc(k)+'</span><strong>'+esc(v||'—')+'</strong></div>';
  const lines=t=>{
    const parts=Array.isArray(t?.segments)?t.segments.filter(s=>s&&String(s.text||'').trim()):[];
    return parts.length?parts.map(s=>'<div class="performance-modal-line"><strong>'+esc(s.speaker==='customer'?'Customer':s.speaker==='agent'?'You':'Speaker')+'</strong><p>'+esc(s.text)+'</p></div>').join(''):'<p class="performance-modal-plain">'+esc(t?.transcript||'No transcript was saved for this call.')+'</p>';
  };
  let active;
  window.steadyHandsOpenAdminCall=({ids,activityId,trigger})=>{
    active?.close();
    ids=[...new Set((ids||[]).filter(Boolean).map(String))];
    let index=ids.indexOf(String(activityId));
    if(index<0)return;
    const client=window.steadyHandsCRMClient;
    if(!client)return;
    const overlay=document.createElement('div');
    overlay.className='performance-detail-overlay';
    overlay.innerHTML='<section class="performance-detail-shell" role="dialog" aria-modal="true" aria-label="Call details" tabindex="-1"><header class="performance-detail-header"><strong data-detail-title>Call details</strong><span class="performance-detail-count" aria-live="polite"></span><button type="button" data-detail-close aria-label="Close call details">✕</button></header><div class="performance-detail-main"><button type="button" class="performance-detail-arrow" data-detail-prev aria-label="Previous call">‹</button><div class="performance-detail-content" role="status">Loading call details…</div><button type="button" class="performance-detail-arrow" data-detail-next aria-label="Next call">›</button></div><footer>← Previous call &nbsp; · &nbsp; Next call → &nbsp; · &nbsp; Esc to close</footer></section>';
    const dialog=overlay.querySelector('[role="dialog"]');
    const content=overlay.querySelector('.performance-detail-content');
    const prev=overlay.querySelector('[data-detail-prev]');
    const next=overlay.querySelector('[data-detail-next]');
    const title=overlay.querySelector('[data-detail-title]');
    const count=overlay.querySelector('.performance-detail-count');
    let generation=0;
    const show=async()=>{
      const selected=ids[index],current=++generation;
      count.textContent=(index+1)+' / '+ids.length;
      prev.disabled=index===0;next.disabled=index===ids.length-1;
      title.textContent='Call details';
      content.setAttribute('role','status');
      content.textContent='Loading call details…';
      try{
        const {data:call,error}=await client.from('callcenter_call_activity').select('id,user_id,crm_id,duration_seconds,outcome,call_sid,caller_id_used,connected_at,ended_at,created_at').eq('id',selected).maybeSingle();
        if(error)throw error;
        if(!call)throw Error('Call not found.');
        const [u,l,t]=await Promise.all([
          client.from('callcenter_profiles').select('user_id,display_name,email').eq('user_id',call.user_id).maybeSingle(),
          call.crm_id?client.from('crm').select('id,company,name,phone,notes,stage').eq('id',call.crm_id).maybeSingle():Promise.resolve({data:null}),
          client.from('callcenter_transcripts').select('id,call_activity_id,company,phone,started_at,ended_at,transcript,segments,created_at').eq('call_activity_id',selected).order('created_at',{ascending:false}).limit(1).maybeSingle()
        ]);
        if(!overlay.isConnected||current!==generation)return;
        if(u.error)throw u.error;
        if(l.error)throw l.error;
        const user=u.data||{},lead=l.data||{},transcript=t.data||null;
        title.textContent=lead.company||lead.name||transcript?.company||'Call details';
        content.removeAttribute('role');
        content.innerHTML='<section class="performance-modal-hero"><small>CALL OUTCOME</small><h2>'+esc(call.outcome||'No outcome')+'</h2><p>'+esc(when(call.created_at))+'</p></section>'+
          '<section class="performance-modal-fields">'+field('Associate',user.display_name||user.email||'Unknown user')+field('Lead',lead.company||lead.name||transcript?.company||'Unknown')+field('Phone',lead.phone||transcript?.phone)+field('Duration',duration(call.duration_seconds))+field('Caller ID',call.caller_id_used||'Not captured')+field('Connected',when(call.connected_at||transcript?.started_at))+field('Ended',when(call.ended_at||transcript?.ended_at))+field('Stage',lead.stage)+'</section>'+
          '<section class="performance-modal-section"><h3>Conversation</h3>'+(t.error?'<p role="alert">Transcript unavailable: '+esc(t.error.message)+'</p>':lines(transcript))+'</section>'+
          '<section class="performance-modal-section"><h3>Notes</h3><p class="performance-modal-plain">'+esc(lead.notes||'No lead notes.')+'</p></section>'+
          '<section class="performance-modal-section"><h3>Call identifiers</h3><div class="performance-modal-fields">'+field('Activity ID',call.id)+field('Transcript ID',transcript?.id||'Not available')+field('Twilio CallSid',call.call_sid||'Not captured')+'</div></section>';
      }catch(error){if(overlay.isConnected&&current===generation)content.innerHTML='<p role="alert">Unable to load call details: '+esc(error.message||'Please try again.')+'</p>';}
    };
    const move=delta=>{const candidate=index+delta;if(candidate<0||candidate>=ids.length)return;index=candidate;void show();};
    const close=()=>{
      ++generation;
      document.removeEventListener('keydown',onKey,true);
      overlay.remove();
      if(active?.close===close)active=null;
      trigger?.focus?.();
    };
    const onKey=e=>{
      if(e.key==='Escape'){e.preventDefault();close();}
      else if(e.key==='ArrowLeft'&&!['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)){e.preventDefault();move(-1);}
      else if(e.key==='ArrowRight'&&!['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)){e.preventDefault();move(1);}
      else if(e.key==='Tab'){
        const controls=[...overlay.querySelectorAll('button:not(:disabled)')];
        const at=controls.indexOf(document.activeElement);
        if(e.shiftKey&&at===0){e.preventDefault();controls.at(-1)?.focus();}
        else if(!e.shiftKey&&at===controls.length-1){e.preventDefault();controls[0]?.focus();}
      }
    };
    prev.addEventListener('click',()=>move(-1));
    next.addEventListener('click',()=>move(1));
    overlay.querySelector('[data-detail-close]').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.addEventListener('keydown',onKey,true);
    document.body.appendChild(overlay);
    active={close};
    void show();
    dialog.focus();
  };
})();