import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('PDF exports download a generated document, rather than invoking Safari print', async () => {
  const source=await readFile(new URL('../performance-transcript-export.js', import.meta.url),'utf8');
  assert.match(source, /async function downloadPdf\(calls,metadata\)/);
  assert.match(source, /pdf\.save\(/);
  assert.match(source, /if\(format==='pdf'\)return downloadPdf\(calls,metadata\)/);
  assert.doesNotMatch(source, /window\.print\(/);
  assert.doesNotMatch(source, /window\.open\(/);
  assert.match(source, /pdf\.addPage\(\)/);
  assert.match(source, /PDF \(Direct download, compact layout\)/);
});
