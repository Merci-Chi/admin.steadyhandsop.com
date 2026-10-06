(() => {
  const URL='https://glonbvrcudwuzjundrii.supabase.co';
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const state={core:[],attention:[],functions:[]};

  function row(icon,title,detail,status='ok',value=''){
    return '<div class="admin-system-row '+status+'"><span class="admin-system-icon"><i data-lucide="'+icon+'"></i></span><span class="admin-system-main"><strong>'+esc(title)+'</strong><small>'+esc(detail)+'</small></span>'+(value!==''?'<b>'+esc(value)+'</b>':'')+'<span class="admin-system-dot"></span></div>';
  }
  function render(){
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

  async function tableCheck(c,table,label){
    const {count,error}=await c.from(table).select('*',{count:'exact',head:true});
    if(error) return ['database',label,error.message,'bad','Error'];
    return ['database',label,'Table available to this admin session.','ok',String(count??0)];
  }

  async function exactCount(query){
    const {count,error}=await query;
    if(error) throw error;
    return count||0;
  }

  async function functionCheck(name){
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