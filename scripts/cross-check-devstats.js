// Cross-check this project's data against CNCF DevStats' "PR Time to Approve and
// Merge" for kubernetes/kubernetes. DevStats' definitions (metrics/kubernetes/
// time_metrics.sql) are recomputed on our data so like is compared with like:
//   - merged PRs grouped by the month they were created
//   - clock starts when the PR was opened (draft time included)
//   - FIRST lgtm and approved label adds
//   - open→lgtm falls back to approve, then merge; lgtm→approve falls back to
//     merge, else 0; approve→merge is 0 with no approved label
//   - percentile_disc (nearest rank) median and 85th percentile, in hours
// Reads data/raw/merged.json (npm run fetch) and DevStats' public Grafana API.
//   node scripts/cross-check-devstats.js 2026-08 2026-09
import { readFile } from 'node:fs/promises';
import { percentile } from '../src/rollup.js';
import { stageDurations, readyTime } from '../src/stages.js';

const DEVSTATS = 'https://k8s.devstats.cncf.io/api/ds/query';
const DATASOURCE = { type: 'postgres', uid: 'P172949F98CB31475' };
const SERIES = 'tmetkuberneteskubernetesallalla';
const STAGES = [
  ['o2l', 'open → lgtm'],
  ['l2a', 'lgtm → approve'],
  ['a2m', 'approve → merge'],
];

const months = process.argv.slice(2);
if (months.length === 0) months.push('2026-08', '2026-09');

const H = 3_600_000;
const hours = (from, to) => (Date.parse(to) - Date.parse(from)) / H;
const firstAdd = (pr, label) => pr.events.find((e) => e.type === 'labeled' && e.label === label)?.at ?? null;

/** One PR's three DevStats stage times, in hours. */
export function devstatsTimes(pr) {
  const lgtm = firstAdd(pr, 'lgtm');
  const approve = firstAdd(pr, 'approved');
  return {
    o2l: hours(pr.createdAt, lgtm ?? approve ?? pr.mergedAt),
    l2a: lgtm ? hours(lgtm, approve ?? pr.mergedAt) : 0,
    a2m: approve ? hours(approve, pr.mergedAt) : 0,
  };
}

async function devstatsMonthly() {
  const names = STAGES.flatMap(([k]) => [`${SERIES}med${k}`, `${SERIES}p85${k}`]);
  const body = {
    from: String(Date.parse('2026-01-01')),
    to: String(Date.now()),
    queries: [{
      refId: 'A',
      datasource: DATASOURCE,
      format: 'table',
      rawSql: `select time, series, value from stime_metrics_repos where period = 'm' and series in (${names.map((n) => `'${n}'`).join(',')}) order by time`,
    }],
  };
  const res = await fetch(DEVSTATS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`DevStats ${res.status}: ${await res.text()}`);
  const [times, series, values] = (await res.json()).results.A.frames[0].data.values;
  const out = {};
  times.forEach((t, i) => {
    const month = new Date(t).toISOString().slice(0, 7);
    (out[month] ??= {})[series[i].slice(SERIES.length)] = values[i];
  });
  return out;
}

const fmt = (h) => (h === null || h === undefined ? '—' : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);

const merged = JSON.parse(await readFile('data/raw/merged.json', 'utf8'));
const ds = await devstatsMonthly();

console.log(`Our data: ${merged.prs.length} PRs merged ${merged.window.from.slice(0, 10)} to ${merged.window.to.slice(0, 10)}, fetched ${merged.fetchedAt.slice(0, 10)}.`);
for (const month of months) {
  const cohort = merged.prs.filter((pr) => pr.createdAt.startsWith(month));
  const times = cohort.map(devstatsTimes);
  console.log(`\nPRs created ${month}, merged by our fetch: ${cohort.length}`);
  console.log('stage'.padEnd(18), 'DevStats med'.padStart(13), 'ours med'.padStart(10), 'DevStats p85'.padStart(13), 'ours p85'.padStart(10));
  for (const [k, label] of STAGES) {
    const vals = times.map((t) => t[k]);
    const d = ds[month] ?? {};
    console.log(label.padEnd(18), fmt(d[`med${k}`]).padStart(13), fmt(percentile(vals, 50)).padStart(10), fmt(d[`p85${k}`]).padStart(13), fmt(percentile(vals, 85)).padStart(10));
  }
  // The same cohort under this project's own definitions, to show what the definitions change.
  const own = cohort.map(stageDurations);
  const draftHours = cohort.map((pr) => hours(pr.createdAt, readyTime(pr)));
  console.log(`  this project's definitions, same cohort: review (ready → final lgtm) median ${fmt(percentile(own.map((s) => s.review).filter((v) => v !== null), 50))}; draft time before ready median ${fmt(percentile(draftHours, 50))}, p85 ${fmt(percentile(draftHours, 85))}`);
}
