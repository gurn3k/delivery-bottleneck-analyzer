import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { MIN_SAMPLE, CROSS_CUTTING_SIG_COUNT } from '../src/config.js';
import { rollup } from '../src/rollup.js';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const merged = await readJson('data/raw/merged.json');
const open = await readJson('data/raw/open.json');

// Open-PR waits are measured at fetch time, so a rerun on old data gives the same answer.
const result = rollup({ merged: merged.prs, open: open.prs, now: open.fetchedAt });

const metrics = {
  repo: merged.repo,
  fetchedAt: open.fetchedAt,
  generatedAt: new Date().toISOString(),
  window: merged.window,
  units: 'days',
  minSample: MIN_SAMPLE,
  crossCuttingSigCount: CROSS_CUTTING_SIG_COUNT,
  ...result,
};

await mkdir('site/data', { recursive: true });
await writeFile('site/data/metrics.json', JSON.stringify(metrics));

const o = metrics.overall;
console.log(`Merged: ${o.merged.n} PRs, median cycle ${o.merged.cycle.median}d, p90 ${o.merged.cycle.p90}d`);
console.log(`Open: ${o.backlog.n} PRs, ${o.backlog.untouched.count} untouched`);
console.log('Top bottlenecks (PR-days of waiting):');
for (const b of metrics.bottlenecks.slice(0, 5)) {
  console.log(`  ${b.rank}. sig/${b.sig} ${b.state}: ${b.count} PRs x ${b.medianWaitDays}d median = ${b.prDays} PR-days  e.g. #${b.examples.join(', #')}`);
}
console.log('Wrote site/data/metrics.json');
