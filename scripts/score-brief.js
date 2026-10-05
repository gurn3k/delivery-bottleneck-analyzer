// Score briefs against ground truth computed from site/data/metrics.json.
//   node scripts/score-brief.js [brief.json ...] [--sheet]
// With no files, scores site/data/brief.json. --sheet writes a review sheet per
// brief to eval/brief/reviews/ for a person to mark each bullet true or false.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { buildInput, citationGroups, validateBrief } from '../src/brief.js';
import { allowedNumbers, buildTraps, findTraps, keyFindings, coverage } from '../src/brief-checks.js';

const args = process.argv.slice(2);
const sheet = args.includes('--sheet');
const files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0) files.push('site/data/brief.json');

const metrics = JSON.parse(await readFile('site/data/metrics.json', 'utf8'));
const input = buildInput(metrics);
const groups = citationGroups(input);
const numbers = allowedNumbers(input);
const traps = buildTraps(metrics);
const findings = keyFindings(metrics);

const factsCitedBy = (prs) => input.facts.filter((f) => prs.length > 0 && prs.every((pr) => f.examples.includes(pr))).map((f) => f.fact);

for (const file of files) {
  const brief = JSON.parse(await readFile(file, 'utf8'));
  const { ok, errors } = validateBrief(brief, groups, { numbers, traps });
  const cov = coverage(brief.bullets ?? [], findings);
  const label = brief.run ? `run ${brief.run}` : basename(file);

  console.log(`\n${label}: ${ok ? 'PASS' : 'REJECT'} · covers ${cov.filter((c) => c.covered).length} of ${cov.length} key findings`);
  for (const e of errors) console.log(`  - ${e}`);
  console.log(`  covered: ${cov.filter((c) => c.covered).map((c) => c.id).join(', ') || 'none'}`);

  if (!sheet) continue;
  const lines = [
    `# Brief review: ${label}`,
    '',
    `Automated result: **${ok ? 'pass' : 'reject'}**. Data fetched ${metrics.fetchedAt.slice(0, 10)}.`,
    '',
    'For each bullet, read the facts it cites and mark one box. A bullet is **misleading** if every number is right but the reading is wrong.',
    '',
  ];
  (brief.bullets ?? []).forEach((b, i) => {
    lines.push(`## ${i + 1}. ${b.text}`, '');
    lines.push(`Cites: ${(b.prs ?? []).map((n) => `#${n}`).join(', ') || 'nothing'}`, '');
    const facts = factsCitedBy(b.prs ?? []);
    lines.push('Facts behind the citations:', '', ...(facts.length ? facts.map((f) => `- ${f}`) : ['- (citations do not match a single fact)']), '');
    const hits = findTraps(b.text, traps);
    if (hits.length) lines.push(`Automated flags: ${hits.map((t) => t.id).join(', ')}`, '');
    lines.push('- [ ] true  - [ ] misleading  - [ ] false', '', 'Note:', '');
  });
  lines.push('## Coverage', '', ...cov.map((c) => `- [${c.covered ? 'x' : ' '}] ${c.finding}`), '');
  await mkdir('eval/brief/reviews', { recursive: true });
  const out = `eval/brief/reviews/${basename(file, '.json')}.md`;
  await writeFile(out, lines.join('\n'));
  console.log(`  review sheet: ${out}`);
}
