(()=>{'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={members:[],selected:new Set(),busy:false};const db=()=>window.steadyHandsCRMClient;
const audience=()=>document.querySelector('input[name=audience]:checked')?.value||'all';
function render(){
 const q=$('recipientSearch').value.toLowerCase().trim();
 const filtered=state.members.filter(m=>(m.name+' '+m.email+' '+m.role).toLowerCase().includes(q));
 $('teamRecipientList').innerHTML=filtered.map(m=>'<label><input type="checkbox" data-recipient="'+esc(m.id)+'" '+(state.selected.has(m.id)?'checked':'')+'><span><strong>'+esc(m.name)+'</strong> <small>· '+esc(m.role)+' · '+esc(m.email)+'</small></span></label>').join('')||'<p>No matching active members.</p>';
 $('selectedMemberCount').textContent=state.selected.size+' selected';
 $('activeTeamCount').textContent='('+state.members.length+')';
 $('teamRecipientPicker').hidden=audience()!=='selected';
 const task=$('messageKind').value==='task';$('taskPriorityWrap').hidden=!task;$('taskDueWrap').hidden=!task;
 $('sendBroadcast').textContent=task?'Assign task':'Publish update';
}
async function load(){
 if(!db())return;
 $('broadcastStatus').textContent='Loading active team members…';
 try{
  const [profiles,permissions]=await Promise.all([
   db().from('callcenter_profiles').select('user_id,display_name,email,disabled_at'),
   db().from('team_permissions').select('user_id,role,active,listed,sales_enabled')
  ]);
  if(profiles.error||permissions.error)throw profiles.error||permissions.error;
  const permitted=new Map((permissions.data||[]).filter(p=>p.active===true&&p.listed!==false&&(['ADMIN','SALES'].includes(p.role)||p.sales_enabled===true)).map(p=>[String(p.user_id),p]));
  state.members=(profiles.data||[]).filter(p=>!p.disabled_at&&permitted.has(String(p.user_id))).map(p=>{
   const t=permitted.get(String(p.user_id));
   return {id:String(p.user_id),name:p.display_name||p.email||'Team member',email:p.email||'',role:t.role||'Outreach'};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  $('broadcastStatus').textContent='';render();
 }catch(e){$('broadcastStatus').textContent='Unable to load active members: '+e.message;}
}
document.querySelectorAll('input[name=audience]').forEach(r=>r.addEventListener('change',render));
$('messageKind').addEventListener('change',render);
$('recipientSearch').addEventListener('input',render);
$('teamRecipientList').addEventListener('change',e=>{const id=e.target.dataset.recipient;if(!id)return;e.target.checked?state.selected.add(id):state.selected.delete(id);render();});
$('selectAllVisible').onclick=()=>{const q=$('recipientSearch').value.toLowerCase().trim();state.members.filter(m=>(m.name+' '+m.email+' '+m.role).toLowerCase().includes(q)).forEach(m=>state.selected.add(m.id));render();};
$('clearRecipients').onclick=()=>{state.selected.clear();render();};
$('teamBroadcastForm').addEventListener('submit',async e=>{
 e.preventDefault();if(state.busy)return;
 const kind=$('messageKind').value,title=$('messageTitle').value.trim(),body=$('messageBody').value.trim();
 const recipients=audience()==='all'?null:[...state.selected];
 if(!title){$('broadcastStatus').textContent='Enter a title.';return;}
 if(recipients&&!recipients.length){$('broadcastStatus').textContent='Choose at least one recipient.';return;}
 const count=recipients?.length??state.members.length;
 if(!count){$('broadcastStatus').textContent='No active team members available.';return;}
 if(!confirm('Send '+(kind==='task'?'task':'update')+' to '+count+' active team member'+(count===1?'':'s')+'?'))return;
 const due=$('messageDue').value;
 state.busy=true;$('sendBroadcast').disabled=true;$('broadcastStatus').textContent='Publishing…';
 try{
  const {data,error}=await db().rpc('admin_publish_team_message',{
   p_kind:kind,p_title:title,p_body:body,p_recipients:recipients,
   p_due_at:kind==='task'&&due?new Date(due).toISOString():null,
   p_priority:$('messagePriority').value
  });
  if(error)throw error;
  $('broadcastStatus').textContent='Published successfully to '+data+' active team member'+(data===1?'':'s')+'.';
  $('messageTitle').value='';$('messageBody').value='';$('messageDue').value='';
 }catch(error){$('broadcastStatus').textContent='Not published: '+(error.message||error);}
 finally{state.busy=false;$('sendBroadcast').disabled=false;}
});
render();if(db())load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();