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
Forwarding accepts external and managed Twilio numbers. Ten-digit US numbers
are saved with +1; international destinations require their country code.
The UI rejects invalid numbers and cycles; the signed webhook independently
follows managed routes, rejects cycles and unavailable targets, and connects
directly to the final Outreach identity or external phone. App destinations
require an active eligible assigned user with Outreach open. External forwarding
works without an assignment. External phones retain press-1 screening.

Before deploying this update, apply `sql/unassigned-phone-forwarding.sql` (or
the paired Outreach `20261019000000_unassigned_phone_forwarding.sql` migration),
then deploy the updated Outreach `twilio-inbound` function, then publish Admin.
The migration allows private unattributed call records for unassigned external
routes; existing RLS and grants remain unchanged. Managed forwarding needs the
backend update as well as the frontend. Existing active calls keep their resolved
destination and recipient; later edits apply to new calls.

No production SQL, deployments, or calls were performed by this change.

