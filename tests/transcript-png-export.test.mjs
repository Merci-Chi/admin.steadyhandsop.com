import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('PNG is offered in bulk and single transcript exports',async()=>{
 const source=await readFile(new URL('../performance-transcript-export.js',import.meta.url),'utf8');
 assert.match(source,/value="png">PNG images/);
 assert.match(source,/if\(format==='png'\)return downloadPng\(calls,metadata\)/);
 assert.match(source,/canvas\.toBlob\(/);
 assert.match(source,/pages\.length===1/);
 assert.match(source,/zip\.generateAsync\(/);
 assert.match(source,/\['pdf','png','csv','txt'\]/);
});
