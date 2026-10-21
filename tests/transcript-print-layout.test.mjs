import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('bulk transcript print layout flows continuously instead of forcing one call per page',async()=>{
  const source=await readFile(new URL('../performance-transcript-export.js',import.meta.url),'utf8');
  assert.match(source,/article\{[^}]*break-before:auto/);
  assert.match(source,/article\{[^}]*page-break-before:auto/);
  assert.doesNotMatch(source,/article\{break-before:page\}/);
  assert.match(source,/\.line\{[^}]*break-inside:avoid/);
});
