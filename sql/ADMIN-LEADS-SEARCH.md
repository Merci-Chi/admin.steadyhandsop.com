# All Leads timeout repair

The page now fetches the requested rows without an exact count, then loads counts
in the background. A slow or failed count no longer replaces visible results with
an error. Previous/Next pagination works without counts, and selecting all matching
records requires an actual exact count. Superseded row/count requests are aborted.
All Leads defaults to all assignments; the None filter remains available explicitly.

For the database search itself, run `admin-leads-search-performance.sql` in the
Supabase SQL Editor for the CRM project:

1. Run setup section 1 and inspect `trgm_schema`. The index statement uses
   `extensions.gin_trgm_ops`; if the extension already lives in `public`, replace
   those nine operator-class references with `public.gin_trgm_ops`.
2. Highlight and run **each CREATE INDEX statement separately**, in the same
   editor. Do not select the entire file or wrap it in BEGIN/COMMIT:
   PostgreSQL requires concurrent index builds outside transaction blocks.
3. Run ANALYZE and the final verification query. All three indexes must report
   `indisvalid = true`. If a build is interrupted, inspect and repair that invalid
   index before rerunning; IF NOT EXISTS does not repair invalid indexes.
4. Reload All Leads and search for Grandma. Use Assigned: All or her salesperson.

The trigram index covers the existing nine search fields without changing substring
search semantics. The two B-tree indexes support archive/assignment filters and
newest-first ordering. Concurrent creation permits CRM writes while indexes build,
but the builds can take time and consume database resources on a large CRM.

No rows are inserted, deleted, reassigned, or unarchived by this script. It does not
change row-level security or role permissions. It has not been executed against the
live database here; verify search latency there after the index builds complete.

References:
- https://www.postgresql.org/docs/current/pgtrgm.html
- https://www.postgresql.org/docs/current/indexes-multicolumn.html
- https://www.postgresql.org/docs/current/sql-createindex.html
- https://postgrest.org/en/stable/references/api/pagination_count.html

## Area code filter

Use the separate **Area code** field next to search, for example `970`. It matches
three-digit NANP area codes in either `phone` or `altphone`, allowing punctuation,
a leading `1` / `+1`, and trailing extensions. A number containing `970` only in
its middle or suffix does not match. Clear the field to remove this filter.
Text search and existing assignment, archive, tag, source, and advanced filters
still apply together.

No additional database migration is required. Area-code filtering uses the existing
bounded primary-key scan and progress indicator because the raw phone columns have
inconsistent formatting. Large lead lists may take time to scan; pagination and
select-all-matching use the completed normalized result cache.
