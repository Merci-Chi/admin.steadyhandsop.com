import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const browser={};
vm.runInNewContext(readFileSync(new URL('../admin-lead-timezone.js', import.meta.url),'utf8'),{window:browser,Intl});
const zone=lead=>browser.steadyHandsLeadTimezone(lead).zone;
test('infers known area codes from 10 and country-coded 11 digit phones',()=>{
 assert.equal(zone({phone:'5058185158'}),'America/Denver');
 assert.equal(zone({phone:'(503) 525-0003'}),'America/Los_Angeles');
 assert.equal(zone({phone:'+1 617 555 0130'}),'America/New_York');
 assert.equal(zone({phone:'312-555-0101'}),'America/Chicago');
});
test('preserves stored timezones over area code',()=>assert.equal(zone({phone:'5035250003',timezone:'America/New_York'}),'America/New_York'));
test('does not falsely guess for split area codes, invalid numbers or conflicting phones',()=>{
 assert.equal(zone({phone:'2085550101'}),'');
 assert.equal(zone({phone:'8505550101'}),'');
 assert.equal(zone({phone:'5058185158',altphone:'5035250003'}),'');
 assert.equal(zone({phone:'123'}),'');
});
