# Batch 3: unassign leads linked to pipeline history

Status: draft only. SQL has not been applied to production.

## Problem

The CRM assignment trigger copies `assigned_user_id` into linked pipeline records. Setting it to NULL during unassignment violates the pipeline's required `salesperson_user_id`, rolling back the CRM update.

## Proposed behavior to review

Unassigning a CRM lead clears its CRM owner and assignment label, while retaining the last salesperson on existing pipeline history. This draft does not make pipeline owners nullable, delete records, relax RLS, or bypass existing ownership/audit triggers. Reassigning the CRM lead to a new non-NULL owner continues to transfer linked pipeline rows. The old pipeline owner can retain whatever historical access existing pipeline policies already allow; this is a behavior choice to review before approval.

If the intended behavior is to remove ownership and historical access from pipeline records as well, do not apply this draft. That requires a separate schema/access design rather than silently weakening the NOT NULL constraint.

## Deployment and verification

1. Complete and verify batches 1 and 2 first.
2. Approve the history-retention behavior above and obtain explicit authorization to change the production trigger function.
3. Apply `sql/admin-unassign-pipeline.sql` as a database migration. It aborts if the trigger or original function body differs from the inspected version.
4. In a test account, unassign a test lead with linked pipeline rows. Verify the CRM owner ID and label clear, pipeline history remains, and pipeline owners remain non-NULL.
5. Reassign that lead and verify its pipeline records transfer to the new salesperson. Confirm a downstream guard rejection still rolls back the assignment atomically.
6. Verify ordinary leads without pipeline rows still unassign correctly and existing non-admin restrictions remain enforced.

No production lead data should be used as disposable test data.

## Tests and rollback

Run `node --test tests/unassign-pipeline.test.mjs` and `npm test`. The test reproduces the original NOT NULL failure, then verifies unassignment, reassignment, history preservation, absent-pipeline behavior, and rollback on a rejecting downstream trigger.

Rollback: restore the previous `sh_pipeline_reassign_from_crm()` body from the version-control diff. This restores the original behavior, including failed unassignment for pipeline-linked leads. Do not drop constraints or other triggers as a workaround.
