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

Run checks with `node --test tests/*.test.mjs`.
