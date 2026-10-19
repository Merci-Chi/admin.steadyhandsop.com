-- Apply before deploying the updated Outreach twilio-inbound function.
-- Existing user_id=auth.uid() read policies remain unchanged.
begin;
alter table public.outreach_inbound_calls alter column user_id drop not null;
commit;
