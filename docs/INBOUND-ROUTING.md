# Incoming call destinations

Phone Numbers now offers an incoming destination for each managed Twilio number:
Outreach app (default) or Phone forwarding. Save the explicit forwarding number
with country code. Calls require an enabled Twilio Ready number assigned to an
active eligible account. Profile/personal numbers are not selected automatically.

Apply `sql/admin-inbound-destinations.sql` first. If the routing columns are missing,
Admin keeps existing caller-ID controls available and shows routing setup instructions
in place of the incoming destination controls. The same idempotent SQL is included
in the paired Outreach migration; either copy may be run. It adds destination
fields and call routing snapshots, preserves assignments and call history, and
keeps existing table permissions/RLS unchanged. Its inbound tables prerequisite
is the existing Outreach inbound-callback migration.

Deploy the paired Outreach `twilio-inbound` and `twilio-inbound-session` functions,
then publish both frontends. The number's incoming Voice webhook must POST to:

https://glonbvrcudwuzjundrii.supabase.co/functions/v1/twilio-inbound

The outbound TwiML App URL remains separate. An app destination auto-registers
its assigned signed-in user while Outreach is open. Users can opt into device
notifications and answer using that device's microphone/speakers. A closed or
suspended browser cannot receive WebRTC calls; unanswered calls go to business
voicemail. Phone forwarding uses the Admin-saved destination directly, with
press-1 screening and business voicemail if unanswered/unaccepted.

Save actions recheck Admin access and require one confirmed updated record.
Invalid/managed forwarding numbers are rejected in the UI, and the signed inbound
webhook rechecks forwarding validity before dialing. The database enforces format
and self-forwarding constraints. No production SQL, deployments, or calls were
performed by this change.
