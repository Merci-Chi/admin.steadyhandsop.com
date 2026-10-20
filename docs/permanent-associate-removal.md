# Permanent associate removal

The Sales Associates drawer provides **Permanently Remove Associate**, separate from Disable Account.

## What happens
1. Admin confirms the associate's email.
2. The protected `admin-remove-associate` Supabase Edge Function validates the signed-in administrator and prevents self-removal or administrator deletion.
3. Existing `admin_remove_salesperson(p_user_id)` RPC performs current team cleanup (revokes permissions and assignments, unassigns leads while retaining historical activity and commissions).
4. Supabase Auth Admin API performs a **soft delete** of the associate's Auth account. It permanently revokes that login while retaining its ID in `auth.users` for historical foreign keys.
5. Associate is removed from the active team listing; historical call and payment records are not deleted.

## Deployment
- Verify the **existing** `public.admin_remove_salesperson(uuid)` RPC is installed and still preserves history. It must return true upon successful cleanup.
- Deploy `supabase/functions/admin-remove-associate/index.ts` in the shared Supabase project. **Verify JWT ON** because the admin browser calls it with its Supabase access token. Keep service-role key server-side only.
- Merge and deploy Admin UI PR.
- Test with a disposable sales associate, verifying history is still visible and login fails afterward.

**Note:** Auth soft deletion preserves the user ID (not personally identifying login data). If cleanup succeeds but Auth soft-deletion fails, the endpoint reports a partial result and the associate remains disabled; the administrator must investigate before retrying. Do not delete the Auth user with a hard delete; foreign-key cascades could delete historical data.
