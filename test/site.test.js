import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSite } from './fake-dom.js';

// Expected values are computed from the committed snapshot, the same files the
// live page reads, so a refreshed snapshot keeps these tests meaningful.
const metrics = JSON.parse(readFileSync('site/data/metrics.json', 'utf8'));
const brief = JSON.parse(readFileSync('site/data/brief.json', 'utf8'));
const html = readFileSync('site/index.html', 'utf8');
const o = metrics.overall;

const count = (n) => n.toLocaleString('en-US');
// The page's duration rule: hours under a day, one decimal under 10 days, whole days after.
const dur = (d, h = ' h', dd = ' d') => (d < 1 ? `${(d * 24).toFixed(1)}${h}` : `${d < 10 ? d.toFixed(1) : count(Math.round(d))}${dd}`);
const days = (d) => dur(d, ' hours', ' days');
const meta = (attr, key) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))[1];
const textOf = (el) => el.textContent.replace(/\s+/g, ' ').trim();

const site = await renderSite({ metrics, brief });
const page = textOf(site.main);
const headline = textOf(site.main.all('h1')[0]);
const reviewDays = Math.round(o.merged.review.median);
const mergeHours = Math.ceil(o.merged.mergeWait.median * 24);

test('the headline states the snapshot’s review and merge medians', () => {
  assert.equal(headline, `A Kubernetes pull request waits ${reviewDays} days for review, then merges in under ${mergeHours} hours`);
});

test('the hand-written share card and meta tags match the rendered headline', () => {
  // index.html is static, so a refreshed snapshot can leave it stale. Update the
  // meta tags (and share.png) whenever this fails.
  assert.equal(meta('property', 'og:title'), headline);
  assert.ok(meta('property', 'og:image:alt').includes(headline), 'og:image:alt');
  assert.ok(meta('name', 'description').includes(`${reviewDays} days for review, then merges in under ${mergeHours} hours`), 'description');
  const tail = textOf(site.main.all('p', 'summary')[0]);
  assert.ok(tail.length > 0 && meta('property', 'og:description').startsWith(tail), 'og:description');
});

test('key findings and byline show the snapshot’s numbers', () => {
  const findings = textOf(site.main.all('ul', 'findings')[0]);
  assert.ok(findings.includes(`a median ${days(o.merged.review.median)}`));
  assert.ok(findings.includes(`about ${days(o.merged.review.p90)} or longer`));
  assert.ok(findings.includes(`merging took a median ${days(o.merged.mergeWait.median)}`));
  assert.ok(findings.includes(`${count(o.backlog.untouched.count)} open PRs, ${Math.round((o.backlog.untouched.count / o.backlog.n) * 100)}% of the backlog`));
  assert.ok(page.includes(`${count(o.merged.n)} merged and ${count(o.backlog.n)} open pull requests in ${metrics.repo}`));
});

test('figure 1 has one row per stage with its median and p90', () => {
  const rows = site.main.byId('figure-1').all('button', 'row').map(textOf);
  assert.equal(rows.length, 4);
  for (const [i, key] of ['firstResponse', 'review', 'approval', 'mergeWait'].entries()) {
    const { median, p90 } = o.merged[key];
    assert.ok(rows[i].includes(`median ${dur(median)} · p90 ${dur(p90)}`), rows[i]);
  }
});

test('table 1 lists the top 10 queues in rank order', () => {
  const rows = site.main.byId('queues').all('table', 'ranked')[0].all('tbody')[0].all('tr');
  const top = metrics.bottlenecks.slice(0, 10);
  assert.equal(rows.length, top.length);
  rows.forEach((tr, i) => {
    const t = textOf(tr);
    assert.ok(t.startsWith(`${top[i].rank}sig/${top[i].sig}`), t);
    assert.ok(t.includes(count(top[i].prDays)), t);
    for (const n of top[i].examples) assert.ok(t.includes(`#${n}`), `#${n}`);
  });
});

test('the brief shows every bullet with its cited PRs', () => {
  const items = site.main.byId('brief').all('li');
  assert.equal(items.length, brief.bullets.length);
  brief.bullets.forEach((b, i) => {
    assert.ok(textOf(items[i]).startsWith(b.text));
    const links = items[i].all('a').map((a) => a.getAttribute('href'));
    assert.deepEqual(links, b.prs.map((n) => `https://github.com/kubernetes/kubernetes/pull/${n}`));
  });
});

test('the teams table has a row for every group, 10 shown at first', () => {
  const rows = site.main.byId('teams').all('tbody')[0].all('tr').filter((tr) => !tr.className.includes('group-sep'));
  assert.equal(rows.length, Object.keys(metrics.groups).length);
  const named = rows.filter((tr) => /^sig\//.test(textOf(tr.all('th')[0])));
  assert.equal(named.filter((tr) => !tr.hidden).length, Math.min(10, named.length));
});

test('every count that opens evidence opens exactly that many PRs', () => {
  const buttons = site.main.all('button', 'num').filter((b) => /^[\d,]+$/.test(textOf(b)));
  assert.ok(buttons.length > 50, `only ${buttons.length} count buttons`);
  for (const b of buttons) {
    b.click();
    const panel = site.main.all('section', 'evidence')[0];
    assert.ok(panel, `no panel for ${b.getAttribute('aria-label')}`);
    assert.ok(textOf(panel.all('p', 'note')[0]).startsWith(`${textOf(b)} PRs.`), b.getAttribute('aria-label'));
    b.click();
    assert.equal(site.main.all('section', 'evidence').length, 0);
  }
});

test('no value renders as undefined, NaN or null', () => {
  assert.doesNotMatch(page, /undefined|NaN|null|\[object/);
  assert.doesNotMatch(textOf(site.colophon), /undefined|NaN|null/);
});

test('a missing value shows —, never 0, and the headline falls back', async () => {
  const m = structuredClone(metrics);
  m.overall.merged.review.median = null;
  m.overall.merged.review.p90 = null;
  const { main } = await renderSite({ metrics: m, brief });
  assert.equal(textOf(main.all('h1')[0]), 'Where Kubernetes pull requests wait');
  const reviewRow = textOf(main.byId('figure-1').all('button', 'row')[1]);
  assert.ok(reviewRow.includes('median — · p90 —'), reviewRow);
  assert.equal(textOf(main.all('p', 'summary')[0]), '');
});

test('the report still renders without a brief', async () => {
  const { main } = await renderSite({ metrics, brief: null });
  assert.ok(textOf(main.byId('brief')).includes('No brief for this snapshot.'));
  assert.equal(textOf(main.all('h1')[0]), headline);
});

test('a failed data load explains how to serve the site', async () => {
  const { main } = await renderSite({ metrics: null, brief: null });
  assert.match(textOf(main), /snapshot data couldn’t load.*npm run serve/);
});
