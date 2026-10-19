# Steady Hands Admin

Separate administration application for Steady Hands operations.

## Main areas

- Overview
- Users
- Leads
- Activity and call transcripts
- Skills and direct coaching
- Deals
- Payouts
- Phone numbers
- Login activity
- Audit log
- System diagnostics

Access requires an authenticated Supabase user with an active `ADMIN` role in `public.team_permissions`.

Sensitive database access must remain protected by Supabase Row Level Security. The browser-side admin gate is not a replacement for RLS.

## Search progress

Text search races an unsorted database lookup against a progressive scan. If an
exact count proves that the lookup contains every match (up to 500), it cancels
the scan and caches those results immediately. A failed, slow, or truncated lookup
never blocks or replaces the scan. No database sort is requested for this lookup,
so the planner can use the existing trigram search indexes. Actual latency still
needs verification against the live CRM.

The fallback checks the filtered CRM in 250-row primary-key batches and matches
company, contact, both phone fields, email, website, notes, state, and timezone in
the browser. The progress bar reports leads checked and matches found; an optional
exact count supplies the denominator. If that count is unavailable, the bar stays
indeterminate until the scan finishes rather than showing a made-up percentage.

There is no overall search deadline. Statement timeouts retry the same cursor in
smaller batches, with a capped retry delay. Editing/clearing the search or changing
filters cancels the previous scan. Supabase still enforces its per-request limits;
this does not disable server timeouts or change database roles or RLS. Permission
and other non-timeout failures still show an actionable error.

Results appear progressively. Completed results support pagination and selecting
all matches without scanning again. Fresh searches and data changes invalidate the
in-memory cache. Scanning transfers all filtered leads to the authorized browser,
so broad searches on a large CRM can take time. Concurrent edits can change counts
and results during the scan; this is not a database snapshot.

Text and area-code searches exclude leads with `do_not_call = true`, plus legacy
Do Not Call / Do Not Contact / DNC dispositions in stage, outcome, or tags. Both
search paths apply this rule before caching results, so matching totals, pagination,
and select-all-matching exclude those leads too. Unmarked (`NULL` or false) leads
remain searchable. This uses the existing CRM `do_not_call` column; no migration
is required. Browsing without a search retains the existing archive filters.

Run checks with `npm ci && npm test`. The SQL regression tests use an isolated
PostgreSQL engine (PGlite), with a fixture schema and no production connection.

To remove lead assignments in bulk, select leads (or all matching leads), open
**Assign**, choose **Unassigned**, and click **Unassign Leads**. This clears
both the owner ID and assignment label, including assignments to inactive users.
Unassigned remains available even if there are no active salespeople.


## Phone management deployment

Apply `sql/admin-phone-assignment.sql` in the Supabase SQL Editor as the project
administrator **before deploying the updated phones page**. It requires the
existing caller-ID tables; it does not provision Twilio numbers or the voice
backend. The transaction adds one-number-per-user and one-user-per-number unique
indexes and an authenticated, active-ADMIN-only assignment RPC. If existing
assignments contain duplicates, the migration rolls back; review those records
before retrying. Existing table RLS policies remain necessary for direct writes.

The selector now uses that RPC rather than separate browser deletes and inserts.
A failed insert rolls back both previous assignments. A stale phone owner causes
a refresh error rather than overwriting another admin's change. Without the RPC,
the page reports setup required and leaves assignments untouched. Assigning a
person who already has a number moves their default to the selected number.
Choosing Unassigned clears only the selected number's owner.

Twilio readiness is a manual administrative flag. Changing it never assigns the
number to its original requester; use the selector explicitly. Disabled and
pending numbers show their status instead of claiming that calls use them.
Readiness, disable, remove, and approval updates must return a changed row before
the page reports success; rejected writes leave controls available for retry.

Before production sign-off, use test accounts and a dedicated Twilio number to
check adding, assigning/reassigning/unassigning, readiness, disable/enable,
removal (including the deployed foreign-key behavior), and approvals under the
actual RLS policies. Verify that `twilio-voice-outbound` selects only the signed-in
user's assigned, active, ready number, rejects disabled/pending/unassigned numbers,
and that a real test call displays that number. The calling Edge Functions and
Twilio account configuration are outside this repository; local tests do not
verify those integrations or the live database schema.
