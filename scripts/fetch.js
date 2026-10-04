import { mkdir, writeFile } from 'node:fs/promises';
import { REPO, MERGED_WINDOW_DAYS } from '../src/config.js';
import { fetchByDateRange, dedupe } from '../src/fetch-prs.js';
import { getPointsUsed } from '../src/github.js';

const DAY = 86_400_000;
const log = (msg) => console.log(msg);

// Whole UTC days only: the window ends yesterday so partial days never skew a run.
const today = new Date(new Date().toISOString().slice(0, 10));
const mergedTo = new Date(today.getTime() - DAY);
const mergedFrom = new Date(today.getTime() - MERGED_WINDOW_DAYS * DAY);
const fetchedAt = new Date().toISOString();

log(`Fetching ${REPO.owner}/${REPO.name}`);
log(`Merged PRs, ${MERGED_WINDOW_DAYS} days:`);
const merged = dedupe(await fetchByDateRange(REPO, 'is:pr is:merged', 'merged', mergedFrom, mergedTo, log));

log('Open PRs:');
const open = dedupe(await fetchByDateRange(REPO, 'is:pr is:open', 'created', new Date('2014-06-01'), today, log));

await mkdir('data/raw', { recursive: true });
const meta = { repo: `${REPO.owner}/${REPO.name}`, fetchedAt };
await writeFile(
  'data/raw/merged.json',
  JSON.stringify({ ...meta, window: { from: mergedFrom.toISOString(), to: mergedTo.toISOString() }, prs: merged })
);
await writeFile('data/raw/open.json', JSON.stringify({ ...meta, prs: open }));

log(`Done: ${merged.length} merged, ${open.length} open. GitHub API points used: ${getPointsUsed()} of 5,000/hour.`);
