(()=>{
const e=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const $=id=>document.getElementById(id);
const fmt=s=>s?new Date(s).toLocaleString():'—';
let profiles=[],leads=[],locks=[],scheduled=[],matches=[];
function msg(s){$('callManageMessage').textContent=s;}
function render(){
 const people=new Map(profiles.map(p=>[String(p.user_id),p]));
 $('activeLocks').innerHTML=locks.length?locks.map(l=>{const p=people.get(String(l.user_id));return '<div class="admin-user-card" style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><strong>Lead '+e(l.lead_id)+'</strong><small style="display:block">'+e(p?.display_name||p?.email||l.user_id)+'</small><small>Expires '+e(fmt(l.expires_at))+'</small></div><button type="button" data-release="'+e(l.lead_id)+'">Release</button></div>'}).join(''):'<div class="cc-empty">No active calls reserved.</div>';
 const query=($('callbackSearch')?.value||'').toLowerCase();
 const visible=leads.filter(l=>[l.company,l.name,l.phone].some(v=>String(v||'').toLowerCase().includes(query)));
 $('callbackList').innerHTML=visible.length?visible.map(l=>'<div class="admin-user-card" style="display:block"><strong>'+e(l.company||l.name||'Unnamed business')+'</strong><small style="display:block">'+e(l.phone||'No phone')+' · '+e(l.state_code||'State unknown')+' · '+e(fmt(l.callbackdate))+'</small><label style="display:block;margin:10px 0 5px">Assigned salesperson</label><select style="max-width:100%;padding:9px;border-radius:8px" data-owner="'+e(l.id)+'"><option value="">Unassigned</option>'+profiles.map(p=>'<option value="'+e(p.user_id)+'" '+(String(l.callback_owner_id||'')===String(p.user_id)?'selected':'')+'>'+e(p.display_name||p.email)+'</option>').join('')+'</select><button type="button" style="margin-left:8px;padding:9px" data-save="'+e(l.id)+'">Save owner</button></div>').join(''):'<div class="cc-empty">No matching callbacks.</div>';
 const opts=(selected='')=>'<option value="">Choose salesperson</option>'+profiles.map(p=>'<option value="'+e(p.user_id)+'" '+(String(selected)===String(p.user_id)?'selected':'')+'>'+e(p.display_name||p.email)+'</option>').join('');
 $('scheduleList').innerHTML=scheduled.length?scheduled.map(item=>'<div class="admin-user-card" style="display:block"><strong>'+e(item.company||'Unnamed business')+'</strong><small style="display:block">'+e(item.phone||'')+' · '+e(fmt(item.starts_at))+'</small><label style="display:block;margin:8px 0 4px">Assigned salesperson</label><select data-schedule-owner="'+e(item.id)+'" style="padding:9px;max-width:100%">'+opts(item.user_id)+'</select> <button type="button" data-transfer-schedule="'+e(item.id)+'">Transfer schedule</button></div>').join(''):'<div class="cc-empty">No upcoming schedules.</div>';
 $('newFollowupOwner').innerHTML=opts($('newFollowupOwner').value);
 $('newFollowupResults').innerHTML=matches.map(item=>'<button class="admin-user-card" type="button" data-pick-lead="'+e(item.id)+'" style="display:block;text-align:left"><strong>'+e(item.company||item.name||'Unnamed business')+'</strong><small style="display:block">'+e(item.phone||'')+'</small></button>').join('')||'<div class="cc-empty">Search for a lead by company or phone.</div>';
 window.lucide?.createIcons();
}
async function load(){
 const c=window.steadyHandsCRMClient;if(!c)return;
 msg('Loading…');
 const {data,error}=await c.rpc('callcenter_admin_management_snapshot');
 if(error){msg('Unable to load: '+error.message);return;}
 profiles=data?.profiles||[];locks=data?.locks||[];leads=data?.callbacks||[];
 const scheduleR=await c.rpc('admin_outreach_schedules');
 if(scheduleR.error){msg('Callback data loaded. Schedule data needs the provided SQL: '+scheduleR.error.message);scheduled=[];}
 else scheduled=scheduleR.data||[];
 msg(scheduleR.error?'SQL required for schedule transfers':'Updated '+new Date().toLocaleTimeString());render();
}
document.addEventListener('click',async ev=>{
 const btn=ev.target.closest('[data-release],[data-save],[data-transfer-schedule],[data-pick-lead]');if(!btn)return;
 const c=window.steadyHandsCRMClient;
 if(btn.dataset.pickLead){$('newFollowupLeadId').value=btn.dataset.pickLead;const item=matches.find(x=>String(x.id)===btn.dataset.pickLead);$('newFollowupSelected').textContent='Selected: '+(item?.company||item?.name||item?.phone||btn.dataset.pickLead);return;}
 if(btn.dataset.transferSchedule){const id=btn.dataset.transferSchedule;const sel=[...document.querySelectorAll('[data-schedule-owner]')].find(x=>x.dataset.scheduleOwner===id);if(!sel?.value){msg('Choose a salesperson first.');return;}if(!confirm('Transfer this scheduled call to the selected salesperson?'))return;btn.disabled=true;const {error}=await c.rpc('admin_transfer_outreach_schedule',{p_schedule_id:id,p_user_id:sel.value});if(error){msg(error.message);btn.disabled=false;return;}await load();return;}
 if(btn.dataset.release){const id=btn.dataset.release;if(!confirm('Release reservation for lead '+id+'? Only do this if the caller is no longer actively on the call.'))return;
 btn.disabled=true;const {error}=await c.rpc('callcenter_admin_release_lock',{p_lead_id:id});if(error){msg(error.message);btn.disabled=false;return}await load();return;}
 if(btn.dataset.save){const id=btn.dataset.save;const owner=document.querySelectorAll('[data-owner]');const sel=Array.from(owner).find(x=>x.dataset.owner===id);if(!sel)return;
 const userId=sel.value||null;if(!confirm('Update callback owner for this business?'))return;
 btn.disabled=true;const {error}=await c.rpc('callcenter_admin_assign_callback',{p_lead_id:id,p_user_id:userId});if(error){msg(error.message);btn.disabled=false;return}await load();}
});
$('refreshCalls')?.addEventListener('click',load);
$('callbackSearch')?.addEventListener('input',render);

let searchTimer;
$('newFollowupSearch')?.addEventListener('input',()=>{
 clearTimeout(searchTimer);
 const text=$('newFollowupSearch').value.trim();
 $('newFollowupLeadId').value='';
 $('newFollowupSelected').textContent='';
 if(text.length<2){matches=[];render();return;}
 searchTimer=setTimeout(async()=>{
  const c=window.steadyHandsCRMClient;
  const {data,error}=await c.rpc('admin_outreach_find_leads',{p_search:text});
  if(error){msg(error.message);return;}
  if($('newFollowupSearch').value.trim()!==text)return;
  matches=data||[];render();
 },300);
});
$('newFollowupCreate')?.addEventListener('click',async()=>{
 const id=$('newFollowupLeadId').value,user=$('newFollowupOwner').value,date=$('newFollowupWhen').value;
 if(!id||!user||!date){msg('Select a lead, salesperson, and date/time.');return;}
 if(new Date(date).getTime()<=Date.now()){msg('Choose a future follow-up time.');return;}
 if(!confirm('Assign this follow-up to the selected salesperson?'))return;
 const btn=$('newFollowupCreate');btn.disabled=true;
 const {error}=await window.steadyHandsCRMClient.rpc('admin_assign_outreach_followup',{p_lead_id:id,p_user_id:user,p_starts_at:new Date(date).toISOString(),p_note:$('newFollowupNote').value||''});
 btn.disabled=false;
 if(error){msg(error.message);return;}
 $('newFollowupLeadId').value='';$('newFollowupSearch').value='';$('newFollowupWhen').value='';$('newFollowupNote').value='';matches=[];
 await load();
 msg('Follow-up assigned successfully.');
});

if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();