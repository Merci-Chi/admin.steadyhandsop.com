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
