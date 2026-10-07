// Writes the drawn report into site/index.html, so the page has its findings as
// plain HTML before any script runs. Link scanners, search engines and readers
// without JavaScript see the report; app.js redraws it on load with the
// interactive evidence panels. Run after metrics.json or brief.json changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { prerender } from '../src/prerender.js';

const path = 'site/index.html';
const before = readFileSync(path, 'utf8');
const after = await prerender(before, {
  metrics: JSON.parse(readFileSync('site/data/metrics.json', 'utf8')),
  brief: (() => { try { return JSON.parse(readFileSync('site/data/brief.json', 'utf8')); } catch { return null; } })(),
});
writeFileSync(path, after);
console.log(after === before ? `${path} already up to date` : `Wrote the report into ${path} (${Buffer.byteLength(after).toLocaleString('en-US')} bytes)`);
