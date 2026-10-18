# Sales Associates

The first group in desktop and mobile navigation contains Overview (admin.html),
Onboarding, Agreement Actions, and Other Actions. Existing account-management,
onboarding, and agreement tools remain available within these pages.

## Database prerequisite

Run `sql/assigned-action-questionnaires.sql` in Supabase project
`glonbvrcudwuzjundrii` before using Other Actions. This is the same migration
committed to Outreach as
`supabase/migrations/20261018190000_assigned_action_questionnaires.sql`.
It works with or without the older standalone questionnaire SQL and reuses
active ADMIN membership in the existing team_permissions table. This GitHub
change does not execute live SQL, import users, or assign any questionnaires.

## Assign and review

In Sales Associates → Other Actions, choose the actual associate account,
current agreement, and actual scheduled start date. The date is required for
hourly associates and must be Monday–Friday. Assign questionnaire calls the
protected outreach_admin_assign_action RPC. That associate can then open the
questionnaire in Outreach → Action Needed. Assigning again rotates the
assignment ID and invalidates older browser tabs. Cancellation preserves
responses and start-date history. Both operations require database admin access.

The Outcomes list paginates all accessible assignments, latest responses,
associate records, and start-date history. It includes awaiting, submitted,
cancelled, and legacy responses. Filter by commission agreement requests or
start-date changes and expand each associate to inspect all available values.
Responses saved before a reassignment are explicitly marked as previous.
The schema stores the latest questionnaire response per associate; it does not
archive every prior response revision. Every saved start-date extension has
its own history record, and all such records are displayed.

## Overview data

The overview directory honors the existing SALES/sales_enabled/listed rules.
Opening an associate loads accessible profile fields, secure admin-onboarding
details, current work agreement, and latest questionnaire response. It fetches
onboarding details only for the selected user. A generation check prevents an
older request from replacing a different associate's open drawer.

Missing, whitespace-only, null, empty arrays/objects, and literal missing-value
markers are omitted, along with empty section headings. Real 0 and false values
are preserved. Credential fields are excluded. Operational load errors are
reported separately from missing answers. Onboarding details use the same
available-value filtering. Country and state/province are displayed wherever
they exist in the accessible profile or onboarding answers.

The existing admin-onboarding Edge Function provides onboarding-specific data.
If unavailable, accessible profile information still displays. No location,
start date, or compensation agreement is inferred. Existing account creation,
role/access, territory, phone, task, and account-management tools are preserved.

## Validation

Run npm ci and npm test. Tests cover the existing admin suite, available-value
rendering, pagination beyond server caps, grouped navigation, assignment/outcome
behavior, and the questionnaire migration in isolated PGlite PostgreSQL.
Live account integration and visual browser verification remain deployment checks.

## US calling number question

The final questionnaire step requires one of: needs a US number, already has
a US number, or has Google Voice. The last two require a valid 10-digit
US-format number (or +1). Phone answers are stored as phone_setup and
us_phone_number on outreach_action_preferences. Numbers are normalized to +1.
This is format validation, not proof of number ownership or a phone provisioning
request sent to an external provider. Needs-number requests are visible in
Other Actions, including a filter for administrator follow-up.

After the base assigned-action migration, apply the additional phone migration:
`sql/questionnaire-phone-setup.sql`.
Existing answers remain readable. The new protected submission RPC requires
a phone choice for new responses and saves it atomically with completion.
The earlier submission RPC is revoked from browser callers, so open older
questionnaire tabs must reload. No live migration is executed by this commit.

## Status

Run `sql/associate-status.sql` in the Supabase SQL editor, then open
Sales Associates → Status. This standalone migration uses the existing
`team_permissions` columns (`role`, `active`, `sales_enabled`, `listed`).
Only active administrators can read or change these private checklists.
The directory follows the existing SALES/sales_enabled/listed rules.

Click an associate to open their checklist, or their + button to focus the
single-item textbox. Add items individually, check off completed steps, and
expand History to see dated additions, completions, and reopenings. Unchecking
a completed step reopens it without erasing its earlier completion history.
History and checkbox state are saved together in a database transaction.
Concurrent changes from a stale browser are rejected; refresh before retrying.
No live SQL is executed by the GitHub change.
