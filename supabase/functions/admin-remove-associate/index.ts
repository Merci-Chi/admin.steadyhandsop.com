import {createClient} from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': 'https://admin.steadyhandsop.com',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};
const json = (body: unknown, status=200) =>
  new Response(JSON.stringify(body), {status,headers:cors});

Deno.serve(async req => {
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL')||'';
    const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
    const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
    const auth=req.headers.get('Authorization')||'';
    if(!url||!service||!anon||!/^Bearer\s+\S+$/i.test(auth))
      return json({error:'Authentication is required'},401);
    const body=await req.json().catch(()=>null);
    const target=String(body?.user_id||'');
    const email=String(body?.confirm_email||'').trim().toLowerCase();
    if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(target)||!email)
      return json({error:'A valid associate and email confirmation are required'},400);
    const admin=createClient(url,service,{auth:{persistSession:false}});
    const jwt=auth.replace(/^Bearer\s+/i,'');
    const {data:actorData,error:actorError}=await admin.auth.getUser(jwt);
    const actor=actorData?.user;
    if(actorError||!actor)return json({error:'Sign in again to continue'},401);
    if(actor.id===target)return json({error:'You cannot remove your own account'},403);
    const {data:permission,error:permissionError}=await admin.from('team_permissions')
      .select('role,active').eq('user_id',actor.id).maybeSingle();
    if(permissionError||permission?.role!=='ADMIN'||permission?.active!==true)
      return json({error:'Active administrator access required'},403);
    const {data:targetPermission,error:targetPermissionError}=await admin.from('team_permissions')
      .select('role,sales_enabled').eq('user_id',target).maybeSingle();
    if(targetPermissionError||!targetPermission||targetPermission.role==='ADMIN'||
      !(targetPermission.role==='SALES'||targetPermission.sales_enabled===true))
      return json({error:'Only sales associates can be removed using this tool'},403);
    const {data:targetData,error:targetError}=await admin.auth.admin.getUserById(target);
    if(targetError||!targetData?.user)return json({error:'Associate login not found'},404);
    if(String(targetData.user.email||'').toLowerCase()!==email)
      return json({error:'The confirmation email does not match'},400);

    // Use the existing admin-only cleanup RPC to unassign leads, revoke team
    // privileges and phone assignments while preserving history/commissions.
    // Pass the admin's JWT so auth.uid() is available inside the RPC.
    const caller=createClient(url,anon,{
      global:{headers:{Authorization:auth}},
      auth:{persistSession:false,autoRefreshToken:false}
    });
    const {data:removed,error:cleanupError}=await caller.rpc(
      'admin_remove_salesperson',{p_user_id:target}
    );
    if(cleanupError||removed!==true)
      return json({error:'Team cleanup failed; login was NOT deleted: '+(cleanupError?.message||'Not confirmed')},409);

    // Soft delete preserves the auth.users identity referenced by historical
    // records; normal login credentials are deleted and cannot authenticate.
    const {error:deleteError}=await admin.auth.admin.deleteUser(target,true);
    if(deleteError)return json({
      error:'Team access was revoked but permanent login removal failed: '+deleteError.message,
      partial:true
    },500);

    return json({ok:true,message:'Associate removed from the team and login deleted. Historical records retained.'});
  } catch(error) {
    console.error('Permanent associate removal failed',error);
    return json({error:'Unable to complete permanent associate removal'},500);
  }
});
