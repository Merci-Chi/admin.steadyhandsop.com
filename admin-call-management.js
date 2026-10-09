(()=>{
const e=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const $=id=>document.getElementById(id);
const fmt=s=>s?new Date(s).toLocaleString():'—';
let profiles=[],leads=[],locks=[];
function msg(s){$('callManageMessage').textContent=s;}
function render(){
 const people=new Map(profiles.map(p=>[String(p.user_id),p]));
 $('activeLocks').innerHTML=locks.length?locks.map(l=>{const p=people.get(String(l.user_id));return '<div class="admin-user-card" style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><strong>Lead '+e(l.lead_id)+'</strong><small style="display:block">'+e(p?.display_name||p?.email||l.user_id)+'</small><small>Expires '+e(fmt(l.expires_at))+'</small></div><button type="button" data-release="'+e(l.lead_id)+'">Release</button></div>'}).join(''):'<div class="cc-empty">No active calls reserved.</div>';
 const query=($('callbackSearch')?.value||'').toLowerCase();
 const visible=leads.filter(l=>[l.company,l.name,l.phone].some(v=>String(v||'').toLowerCase().includes(query)));
 $('callbackList').innerHTML=visible.length?visible.map(l=>'<div class="admin-user-card" style="display:block"><strong>'+e(l.company||l.name||'Unnamed business')+'</strong><small style="display:block">'+e(l.phone||'No phone')+' · '+e(l.state_code||'State unknown')+' · '+e(fmt(l.callbackdate))+'</small><label style="display:block;margin:10px 0 5px">Assigned salesperson</label><select style="max-width:100%;padding:9px;border-radius:8px" data-owner="'+e(l.id)+'"><option value="">Unassigned</option>'+profiles.map(p=>'<option value="'+e(p.user_id)+'" '+(String(l.callback_owner_id||'')===String(p.user_id)?'selected':'')+'>'+e(p.display_name||p.email)+'</option>').join('')+'</select><button type="button" style="margin-left:8px;padding:9px" data-save="'+e(l.id)+'">Save owner</button></div>').join(''):'<div class="cc-empty">No matching callbacks.</div>';
 window.lucide?.createIcons();
}
async function load(){
 const c=window.steadyHandsCRMClient;if(!c)return;
 msg('Loading…');
 const results=await Promise.all([
 c.from('callcenter_profiles').select('user_id,display_name,email').order('display_name'),
 c.from('callcenter_lead_locks').select('lead_id,user_id,claimed_at,expires_at').gt('expires_at',new Date().toISOString()).order('expires_at').limit(150),
 c.from('crm').select('id,company,name,phone,state_code,callbackdate,callbackat,callback_owner_id').eq('stage','callback').order('callbackdate',{ascending:true,nullsFirst:false}).limit(300)
 ]);
 const error=results.find(x=>x.error)?.error;
 if(error){msg('Unable to load: '+error.message);return;}
 profiles=results[0].data||[];locks=results[1].data||[];leads=results[2].data||[];
 msg('Updated '+new Date().toLocaleTimeString());render();
}
document.addEventListener('click',async ev=>{
 const btn=ev.target.closest('[data-release],[data-save]');if(!btn)return;
 const c=window.steadyHandsCRMClient;
 if(btn.dataset.release){const id=btn.dataset.release;if(!confirm('Release reservation for lead '+id+'? Only do this if the caller is no longer actively on the call.'))return;
 btn.disabled=true;const {error}=await c.rpc('callcenter_admin_release_lock',{p_lead_id:id});if(error){msg(error.message);btn.disabled=false;return}await load();return;}
 if(btn.dataset.save){const id=btn.dataset.save;const owner=document.querySelectorAll('[data-owner]');const sel=Array.from(owner).find(x=>x.dataset.owner===id);if(!sel)return;
 const userId=sel.value||null;if(!confirm('Update callback owner for this business?'))return;
 btn.disabled=true;const {error}=await c.rpc('callcenter_admin_assign_callback',{p_lead_id:id,p_user_id:userId});if(error){msg(error.message);btn.disabled=false;return}await load();}
});
$('refreshCalls')?.addEventListener('click',load);
$('callbackSearch')?.addEventListener('input',render);
if(window.steadyHandsAdminSession)load();else window.addEventListener('steadyhands:admin-ready',load,{once:true});
})();