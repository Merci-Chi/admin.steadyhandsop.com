# Admin recovery: staged fixes

These are reviewable drafts, not an instruction to apply all SQL at once. No database change in these batches has been applied by this drafting work.

| Batch | Scope | Review source | Production status |
| --- | --- | --- | --- |
| 1 | Reduce repeated CRM access checks per query | [Admin PR 20](https://github.com/Merci-Chi/admin.steadyhandsop.com/pull/20), `sql/admin-lead-access-performance.sql` | SQL is in GitHub; not applied to the database. Explicit approval required. |
| 2 | Correct Outreach timestamps and restore scoped catalog reads | [Outreach draft PR 68](https://github.com/Merci-Chi/outreach.steadyhandsop.com/pull/68) | Draft; JavaScript and SQL not deployed. |
| 3 | Unassign CRM leads without violating pipeline owner constraints | This draft's `sql/admin-unassign-pipeline.sql` and `docs/BATCH3-UNASSIGN-PIPELINE.md` | Draft; no production trigger changes. |

The separate Overview/loading-screen fix in [Admin PR 21](https://github.com/Merci-Chi/admin.steadyhandsop.com/pull/21) is already live. It does not apply any of these database scripts.

## Batch 1: performance first

The inspected CRM has about 215,000 rows. Recent unassigned-lead page and count queries took around 15–16 seconds and evaluated row-independent access functions in scan filters. The reviewed SQL wraps the existing STABLE admin-read and pause checks in scalar SELECTs so PostgreSQL can evaluate them once per statement. It preserves roles, restrictive/permissive modes, function definitions, and the access conditions themselves.

Before applying: obtain explicit production approval; confirm the guards still match the current policies; run `tests/admin-lead-access-policy.test.mjs`.

After applying: confirm RLS remains enabled and the exact policy expressions use the wrappers. Compare authenticated query plans and latency using test accounts; verify active admins still read, paused users remain blocked, and non-admin behavior is unchanged. Do not infer production performance from the isolated test alone. If permission results change or performance worsens, restore the original predicates listed in PR 20 before proceeding.

## Batch 2: filters and query correctness

The missing-column query originates in Outreach My Leads, not the Admin page. It now queries the actual `created` column directly instead of intentionally failing a `created_at` probe. The catalog SQL proposes SELECT only for authenticated, active SALES/ADMIN users with enabled profiles; no anonymous or write grants.

Follow `docs/BATCH2-LEAD-FILTERS.md` in Outreach draft PR 68 for SQL approval, deployment order, account checks, and rollback. Verify dates, assignments, tag choices, denied users, and denied catalog writes before proceeding.

## Batch 3: unassignment

The existing CRM trigger copies NULL into the pipeline's required salesperson field. This draft skips the pipeline-owner transfer only when the new CRM owner is NULL. It preserves the historical pipeline owner; later assignment to a new salesperson still transfers linked records.

Review the history-retention behavior explicitly. If historical pipeline access must also be removed on CRM unassignment, stop and design that separately. Do not make the pipeline owner nullable or delete history as an ad hoc workaround.

Follow this draft's batch 3 checklist. Verify CRM owner/label clearing, historical row preservation, non-NULL reassignment, no-pipeline leads, existing authorization, and atomic rollback when another trigger rejects a change.

## Rollout discipline

- Approve and apply one batch at a time, with the previous batch verified before starting the next.
- Merging a SQL file into GitHub does not execute it in Supabase.
- Database policies, grants, and trigger changes require separate explicit approval.
- Keep before/after query plans, error checks, and account-test outcomes with the batch's deployment record.
- Use dedicated test records. Do not treat real production lead records as disposable test data.
