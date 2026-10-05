Steady Hands Outreach — Sign In Update

Replace files in the same folder on your hosted application:
index.html, app.js, styles.css, call.html, account.html, earnings.html, skills.html, more.html

NEW files: login.html, login.js, auth-guard.js

Sign-in uses existing Supabase email/password accounts (no public account registration).
Unauthorized users are routed to login.html. Account > Log Out now signs out.
Visible lead loading messages are friendly; diagnostic errors remain in the browser console.
The Outreach list still displays only CRM businesses linked by preview_inventory.

IMPORTANT: Actual protection of CRM data also requires correct Supabase row-level security (RLS) policies.
A JavaScript sign-in gate by itself is not database access control. You must deploy over HTTPS.
