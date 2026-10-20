# Calling Controls rollout

The Admin Overview controls share the Supabase project used by Outreach.

## Required deployment order

1. Apply the migration `supabase/migrations/20261020153000_associate_calling_policies.sql` from the Outreach repository to the **shared** Supabase database, using a privileged migration runner.
2. Deploy the updated `twilio-voice-outbound` Edge Function from the Outreach repository. Keep its existing Twilio signature validation and function JWT settings.
3. Deploy Outreach's `call-voice-controller.js` and `call.html`.
4. Deploy Admin's `index.html` and `admin-calling-policies.js`.
5. Test a normal call, a 7-second delayed call, a high-biased 7–45-second delayed call, a canceled preparation, and a restricted account. Verify that attempting Twilio dialing directly during a restricted/delayed window fails in the webhook.
6. Restore normal mode for test associates.

**Do not deploy the webhook before the migration.** The webhook deliberately fails closed when the policy table is unavailable.

## Policy meaning

- Normal: no administrator delay.
- Delayed: a fresh, randomly sampled 7–45-second pre-dial preparation. The UI clearly labels it a preparation delay and shows a cancellable 'While you wait' page.
- Restricted: no new outbound calls. The webhook enforces this independently from the browser.
- This is **not** an IP ban or a Twilio outage; never present it as one.

The `associate_calling_policy_audit` table records administrative changes and is readable by active administrators.
