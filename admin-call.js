(() => {
  const esc = value => String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  const fmtDate=value=>{
    if(!value) return '—';
    const d=new Date(value);
    return Number.isNaN(d.getTime())?'—':d.toLocaleString([], {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'});
  };
  const fmtDuration=seconds=>{
    const total=Math.max(0,Number(seconds)||0),m=Math.floor(total/60),s=total%60;
    return m?m+'m '+String(s).padStart(2,'0')+'s':s+'s';
  };

  function renderSegments(transcript) {
    const segments=Array.isArray(transcript?.segments)?transcript.segments:[];
    if(segments.length){
      return segments.map(seg=>`
        <div class="admin-call-transcript-line ${seg.speaker==='customer'?'customer':'agent'}">
          <strong>${seg.speaker==='customer'?'Customer':'You'}</strong>
          <span>${esc(seg.text||'')}</span>
        </div>`).join('');
    }
    const plain=String(transcript?.transcript||'').trim();
    return plain ? '<div class="admin-call-transcript-plain">'+esc(plain).replace(/\n/g,'<br>')+'</div>' : '<div class="cc-empty">No transcript was saved for this call.</div>';
  }

  async function load() {
    const c=window.steadyHandsCRMClient;
    const root=document.getElementById('adminCallDetail');
    const id=new URLSearchParams(location.search).get('id');
    if(!c||!root) return;
    if(!id){root.innerHTML='<section class="admin-dashboard-error"><strong>No call selected.</strong></section>';return;}

    try{
      const {data:call,error:callError}=await c.from('callcenter_call_activity')
        .select('id,user_id,crm_id,duration_seconds,outcome,created_at')
        .eq('id',id).single();
      if(callError) throw callError;

      const [userR,leadR,transcriptR]=await Promise.all([
        c.from('callcenter_profiles').select('user_id,display_name,email,phone').eq('user_id',call.user_id).maybeSingle(),
        call.crm_id ? c.from('crm').select('id,company,name,phone,email,timezone,stage,outcome,notes').eq('id',call.crm_id).maybeSingle() : Promise.resolve({data:null,error:null}),
        c.from('callcenter_transcripts')
          .select('id,call_activity_id,company,contact,phone,started_at,ended_at,duration_seconds,transcript,segments,outcome,created_at')
          .eq('call_activity_id',call.id)
          .order('created_at',{ascending:false})
          .limit(1)
          .maybeSingle()
      ]);
      const err=[userR.error,leadR.error,transcriptR.error].find(Boolean);
      if(err) throw err;

      const user=userR.data||{}, lead=leadR.data||{}, transcript=transcriptR.data||null;
      const label=lead.company||lead.name||transcript?.company||'Unknown lead';

      document.querySelector('.topbar h1').textContent=label;
      root.innerHTML=`
        <section class="admin-call-hero">
          <div class="admin-call-hero-icon"><i data-lucide="phone-call"></i></div>
          <div>
            <span>Call outcome</span>
            <h2>${esc(call.outcome||'No outcome')}</h2>
            <p>${esc(fmtDate(call.created_at))}</p>
          </div>
        </section>

        <section class="admin-call-detail-grid">
          <div><span>User</span><strong>${esc(user.display_name||user.email||'Unknown user')}</strong></div>
          <div><span>Lead</span><strong>${esc(label)}</strong></div>
          <div><span>Phone</span><strong>${esc(lead.phone||transcript?.phone||'—')}</strong></div>
          <div><span>Duration</span><strong>${esc(fmtDuration(call.duration_seconds))}</strong></div>
          <div><span>Started</span><strong>${esc(fmtDate(transcript?.started_at||call.created_at))}</strong></div>
          <div><span>Ended</span><strong>${esc(fmtDate(transcript?.ended_at))}</strong></div>
          <div><span>Stage</span><strong>${esc(lead.stage||'—')}</strong></div>
          <div><span>CRM ID</span><strong>${esc(call.crm_id||'—')}</strong></div>
        </section>

        <section class="admin-call-section">
          <div class="admin-dashboard-head">
            <div><span class="admin-kicker">TRANSCRIPT</span><h2>Conversation</h2></div>
            ${transcript?'<span class="admin-transcript-available"><i data-lucide="check-circle-2"></i>Saved</span>':''}
          </div>
          <div class="admin-call-transcript">${renderSegments(transcript)}</div>
        </section>

        <section class="admin-call-section">
          <div class="admin-dashboard-head"><div><span class="admin-kicker">LEAD CONTEXT</span><h2>Notes</h2></div></div>
          <div class="admin-call-notes">${esc(lead.notes||'No lead notes.')}</div>
        </section>

        <section class="admin-call-section">
          <div class="admin-dashboard-head"><div><span class="admin-kicker">SYSTEM</span><h2>Call identifiers</h2></div></div>
          <div class="admin-call-system">
            <div><span>Activity ID</span><code>${esc(call.id)}</code></div>
            <div><span>Transcript ID</span><code>${esc(transcript?.id||'Not available')}</code></div>
            <div><span>Twilio CallSid</span><code>Not stored on this activity yet</code></div>
          </div>
        </section>`;

      window.lucide?.createIcons();
    }catch(error){
      root.innerHTML=`<section class="admin-dashboard-error"><strong>Unable to load call details.</strong><p>${esc(error?.message||'Please go back and try again.')}</p><a href="activity.html">Back to Activity</a></section>`;
    }
  }

  if(window.steadyHandsAdminSession) load();
  else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();