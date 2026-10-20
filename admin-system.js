(() => {
  const URL='https://glonbvrcudwuzjundrii.supabase.co';
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const state={core:[],attention:[],functions:[]};
  const details=new Map();
  const style=document.createElement('style');
  style.textContent='.admin-system-details-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid #e2a8a8;background:#fff4f4;color:#a62222;border-radius:9px;padding:7px 11px;font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}.admin-system-details-btn svg{width:16px;height:16px}.admin-system-error-dialog{border:0;border-radius:16px;max-width:min(560px,calc(100vw - 32px));width:100%;padding:24px;background:#fff;color:#183253;box-shadow:0 22px 75px #0005}.admin-system-error-dialog::backdrop{background:#0b1934a8}.admin-system-error-dialog h2{margin:0 0 12px;font-size:23px}.admin-system-error-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f6fb;padding:14px;border-radius:10px;font-size:14px}.admin-system-error-dialog .dialog-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.admin-system-error-dialog button{border:1px solid #c9d7e8;background:#edf4fc;color:#153c72;padding:9px 16px;border-radius:9px;cursor:pointer}';
  document.head.append(style);
  const modal=document.createElement('dialog');modal.className='admin-system-error-dialog';modal.innerHTML='<h2>System check details</h2><p id="adminSystemErrorTitle"></p><pre id="adminSystemErrorText"></pre><div class="dialog-actions"><button type="button" id="adminSystemCopyError">Copy error</button><button type="button" id="adminSystemCloseError">Close</button></div>';document.body.append(modal);
  document.getElementById('adminSystemCloseError').onclick=()=>modal.close();
  document.getElementById('adminSystemCopyError').onclick=()=>navigator.clipboard?.writeText(document.getElementById('adminSystemErrorText').textContent||'');
  document.addEventListener('click',event=>{const button=event.target.closest('[data-system-error]');if(!button)return;const item=details.get(button.dataset.systemError);if(!item)return;document.getElementById('adminSystemErrorTitle').textContent=item.title;document.getElementById('adminSystemErrorText').textContent=item.detail;modal.showModal()});

  function row(icon,title,detail,status='ok',value=''){
    const key=status==='bad'||status==='warn'?'check-'+details.size:null;
    if(key)details.set(key,{title,detail});
    return '<div class="admin-system-row '+status+'"><span class="admin-system-icon"><i data-lucide="'+icon+'"></i></span><span class="admin-system-main"><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></span>'+(value!==''?'<b>'+esc(value)+'</b>':'')+(key?'<button type="button" class="admin-system-details-btn" data-system-error="'+key+'" aria-label="View details for '+esc(title)+'"><i data-lucide="circle-alert"></i>View Error</button>':'')+'<span class="admin-system-dot"></span></div>';
  }
  function render(){
    details.clear();
    document.getElementById('adminSystemCore').innerHTML=state.core.map(x=>row(...x)).join('')||'<div class="cc-empty">No checks.</div>';
    document.getElementById('adminSystemAttention').innerHTML=state.attention.map(x=>row(...x)).join('')||'<div class="cc-empty">Nothing needs attention.</div>';
    document.getElementById('adminSystemFunctions').innerHTML=state.functions.map(x=>row(...x)).join('')||'<div class="cc-empty">No function checks.</div>';

    const all=[...state.core,...state.attention,...state.functions];
    const failed=all.filter(x=>x[3]==='bad').length;
    const warning=all.filter(x=>x[3]==='warn').length;
    const healthy=all.filter(x=>x[3]==='ok').length;
    document.getElementById('adminSystemSummary').innerHTML=
      '<div><strong>'+healthy+'</strong><span>Healthy</span></div>'+
      '<div><strong>'+warning+'</strong><span>Warnings</span></div>'+
      '<div><strong>'+failed+'</strong><span>Failures</span></div>'+
      '<div><strong>'+all.length+'</strong><span>Checks</span></div>';
    document.getElementById('adminSystemHeadline').textContent=failed?'System issues detected':warning?'System is online with warnings':'System checks passed';
    document.getElementById('adminSystemUpdated').textContent='Last checked '+new Date().toLocaleString();
    window.lucide?.createIcons();
  }

  function errorDetail(error,status){
    const parts=[error?.message,error?.details,error?.hint,error?.code&&('Code: '+error.code),status&&('HTTP '+status)].filter(Boolean);
    return parts.join('\n')||'Database request failed without an error message. Check the browser Network panel for the CRM request.';
  }

  async function tableCheck(c,table,label){
    try{
      let result=await c.from(table).select('*',{count:'exact',head:true});
      // HEAD responses have no body, so the original database error may be empty.
      // A bounded GET retrieves the server's error without changing data or access.
      if(result.error)result=await c.from(table).select('*',{count:'exact'}).limit(1);
      if(result.error)return ['database',label,errorDetail(result.error,result.status),'bad','Error'];
      return ['database',label,'Table available to this admin session.','ok',String(result.count??0)];
    }catch(error){
      return ['database',label,errorDetail(error),'bad','Error'];
    }
  }

  async function exactCount(query){
    const {count,error}=await query;
    if(error) throw error;
    return count||0;
  }

  async function functionCheck(name){
    // Signed Twilio webhooks intentionally accept POST only and do not expose
    // cross-origin browser health probes. An OPTIONS/CORS failure is not an outage.
    if (name==='twilio-voice-outbound'||name==='twilio-transcription-webhook') {
      return ['shield',name,'Twilio-signed POST webhook. Browser reachability cannot verify health; review Supabase function logs for delivery errors.','warn','Unverified'];
    }
    try{
      const response=await fetch(URL+'/functions/v1/'+name,{method:'OPTIONS',cache:'no-store'});
      if(response.status===404) return ['cloud-off',name,'Function endpoint returned 404.','bad','404'];
      if(response.status>=500) return ['triangle-alert',name,'Endpoint responded but returned a server error.','warn',String(response.status)];
      return ['cloud',name,'Function endpoint is reachable.','ok',String(response.status)];
    }catch(error){
      return ['cloud-off',name,error?.message||'Endpoint could not be reached.','bad','Error'];
    }
  }

  async function run(){
    const c=window.steadyHandsCRMClient;if(!c)return;
    state.core=[];state.attention=[];state.functions=[];
    document.getElementById('adminSystemCore').innerHTML='<div class="cc-empty">Checking database…</div>';
    document.getElementById('adminSystemAttention').innerHTML='<div class="cc-empty">Checking operations…</div>';
    document.getElementById('adminSystemFunctions').innerHTML='<div class="cc-empty">Checking functions…</div>';

    const session=window.steadyHandsAdminSession;
    state.core.push(session?.user?.id
      ? ['shield-check','Admin authentication','Authenticated admin session is active.','ok',session.user.email||'Admin']
      : ['shield-x','Admin authentication','No authenticated admin session was found.','bad','Missing']);

    const tableDefs=[
      ['callcenter_profiles','Profiles'],
      ['team_permissions','Permissions'],
      ['crm','Leads'],
      ['callcenter_call_activity','Call activity'],
      ['callcenter_transcripts','Transcripts'],
      ['callcenter_call_feedback','Call coaching'],
      ['callcenter_commissions','Commissions'],
      ['callcenter_referral_bonuses','Referral bonuses'],
      ['callcenter_phone_numbers','Phone numbers'],
      ['callcenter_phone_assignments','Phone assignments'],
      ['callcenter_direct_skills','Direct skills'],
      ['callcenter_login_activity','Login activity'],
      ['callcenter_admin_audit_log','Audit log']
    ];
    state.core.push(...await Promise.all(tableDefs.map(([t,l])=>tableCheck(c,t,l))));
    render();

    try{
      const [missingSid,missingCaller,pendingPhones,readyPhonesR,assignmentsR,overdue,transcriptsR,callsR]=await Promise.all([
        exactCount(c.from('callcenter_call_activity').select('*',{count:'exact',head:true}).gt('duration_seconds',0).is('call_sid',null)),
        exactCount(c.from('callcenter_call_activity').select('*',{count:'exact',head:true}).gt('duration_seconds',0).is('caller_id_used',null)),
        exactCount(c.from('callcenter_phone_numbers').select('*',{count:'exact',head:true}).eq('twilio_status','pending')),
        c.from('callcenter_phone_numbers').select('id,phone_number').eq('twilio_status','ready').eq('active',true),
        c.from('callcenter_phone_assignments').select('phone_number_id,user_id'),
        exactCount(c.from('callcenter_direct_skills').select('*',{count:'exact',head:true}).neq('status','complete').lt('due_at',new Date().toISOString())),
        c.from('callcenter_transcripts').select('id,call_activity_id').not('call_activity_id','is',null).order('created_at',{ascending:false}).limit(500),
        c.from('callcenter_call_activity').select('id').order('created_at',{ascending:false}).limit(5000)
      ]);

      const ready=readyPhonesR.data||[], assigned=new Set((assignmentsR.data||[]).map(x=>String(x.phone_number_id)));
      const unassignedReady=ready.filter(x=>!assigned.has(String(x.id))).length;
      const activityIds=new Set((callsR.data||[]).map(x=>String(x.id)));
      const orphan=(transcriptsR.data||[]).filter(x=>x.call_activity_id&&!activityIds.has(String(x.call_activity_id))).length;

      state.attention=[
        ['phone-call','Connected calls missing CallSid',missingSid?'Newer connected calls are missing the Twilio CallSid.':'Connected call records include CallSid data.',missingSid?'warn':'ok',String(missingSid)],
        ['phone-forwarded','Connected calls missing caller ID',missingCaller?'Some connected calls have no captured outbound caller ID.':'Caller-ID diagnostics are populated. ',missingCaller?'warn':'ok',String(missingCaller)],
        ['clock-3','Pending phone numbers',pendingPhones?pendingPhones+' phone numbers still need Twilio readiness review.':'No pending phone numbers. ',pendingPhones?'warn':'ok',String(pendingPhones)],
        ['unlink','Ready numbers without assignment',unassignedReady?unassignedReady+' ready caller IDs are not assigned to a user.':'Every active ready caller ID is assigned.',unassignedReady?'warn':'ok',String(unassignedReady)],
        ['target','Overdue direct skills',overdue?overdue+' coaching assignments are past due.':'No overdue coaching assignments.',overdue?'warn':'ok',String(overdue)],
        ['file-warning','Recent transcript links',orphan?orphan+' recent transcripts reference activity outside the loaded activity window or a missing record.':'Recent transcript links look consistent.',orphan?'warn':'ok',String(orphan)]
      ];
    }catch(error){
      state.attention=[['triangle-alert','Operational diagnostics',error?.message||'Unable to run operational checks.','bad','Error']];
    }
    render();

    const names=['twilio-voice-token','twilio-start-transcription','twilio-voice-outbound','twilio-transcription-webhook','twilio-call-details','analyze-call-transcript'];
    state.functions=await Promise.all(names.map(functionCheck));
    render();
  }

  document.getElementById('adminSystemRefresh')?.addEventListener('click',run);
  if(window.steadyHandsAdminSession)run();else window.addEventListener('steadyhands:admin-ready',run,{once:true});
})();