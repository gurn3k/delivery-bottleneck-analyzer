// The public report. Everything is built from data/metrics.json and data/brief.json;
// every number that has PRs behind it opens them in an inline evidence panel.

// The public repository. Confirm at launch; the page links here for source and method.
const REPO_URL = 'https://github.com/gurn3k/delivery-bottleneck-analyzer';
const MAKER_URL = 'https://www.gurn3k.com';
const PR_URL = (n) => `https://github.com/kubernetes/kubernetes/pull/${n}`;
const NA = '—';
const EVIDENCE_PAGE = 25;
const TEAMS_SHOWN = 10;

const STAGES = [
  { key: 'firstResponse', label: 'First response from a person', short: 'First response' },
  { key: 'review', label: 'Reviewer’s lgtm', short: 'Time to lgtm' },
  { key: 'approval', label: 'Approver’s approved label', short: 'Time to approved' },
  { key: 'mergeWait', label: 'Merge, once both labels are set', short: 'Merge wait', fromGates: true },
];
// Whose move each open PR is waiting on, in reading order; on hold is parked last.
// Each state has one colour (st-<key> in app.css) shared by every figure.
const STATES = {
  untouched: { label: 'No human response yet', owner: 'reviewers', hint: 'no comment or review from anyone but the author' },
  reviewer: { label: 'Waiting for a reviewer’s lgtm', owner: 'reviewers', hint: 'someone responded; no lgtm yet' },
  approver: { label: 'Waiting for an approver', owner: 'approvers', hint: 'has lgtm; not yet approved' },
  'merge-pending': { label: 'Waiting to merge', owner: 'CI and the merge queue', hint: 'both labels set' },
  author: { label: 'Waiting on the author', owner: 'the PR’s author', hint: 'rebase, requested changes or a process label' },
  'on-hold': { label: 'On hold', owner: 'parked on purpose', hint: 'draft, held or rotten' },
};

// ---- formatting ----
const num = (n) => (n === null || n === undefined ? NA : n.toLocaleString('en-US'));
function dur(days, long = false) {
  if (days === null || days === undefined) return NA;
  if (days < 1) {
    const h = (days * 24).toFixed(1);
    return long ? `${h} hours` : `${h} h`;
  }
  const d = days < 10 ? days.toFixed(1) : Math.round(days).toLocaleString('en-US');
  return long ? `${d} days` : `${d} d`;
}
const longDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const sigName = (g) => (g === 'cross-cutting' ? 'Cross-cutting (4+ SIGs)' : g === 'no-sig' ? 'No SIG label' : `sig/${g}`);
const pct = (part, whole) => Math.round((part / whole) * 100);

// ---- DOM helper: text always goes in as text, never as HTML ----
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') Object.assign(node.style, v);
    // CSS custom properties go through the CSSOM, which the CSP allows.
    else if (k === 'vars') for (const [p, val] of Object.entries(v)) node.style.setProperty?.(p, String(val));
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}
const prLink = (n) => el('a', { href: PR_URL(n), target: '_blank', rel: 'noopener' }, `#${n}`);

// ---- theme ----
const themeBtn = document.getElementById('theme-btn');
const currentTheme = () =>
  document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
function syncThemeButton() {
  const dark = currentTheme() === 'dark';
  themeBtn.textContent = dark ? 'Light' : 'Dark';
  themeBtn.setAttribute('aria-pressed', String(dark));
  themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}
try {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
} catch {}
syncThemeButton();
themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
  syncThemeButton();
});

// ---- evidence panel ----
let openPanel = null;
function closeEvidence(returnFocus = true) {
  if (!openPanel) return;
  const { panel, trigger } = openPanel;
  panel.remove();
  trigger.setAttribute('aria-expanded', 'false');
  openPanel = null;
  if (returnFocus) trigger.focus();
}

/** Show the PRs behind a number, right after `anchor`. */
function showEvidence(trigger, anchor, { title, note, rows, columns }) {
  const same = openPanel?.trigger === trigger;
  closeEvidence(false);
  if (same) { trigger.focus(); return; }

  let shown = Math.min(EVIDENCE_PAGE, rows.length);
  const tbody = el('tbody');
  const renderRows = () => tbody.replaceChildren(...rows.slice(0, shown).map((r) =>
    el('tr', {},
      el('td', { class: 'l' }, prLink(r.number)),
      el('td', { class: 'title' }, r.title ?? ''),
      columns.map((c) => { const v = c.value(r); return el('td', { class: v === NA ? 'na' : null }, v); }))));
  renderRows();

  const more = el('button', { class: 'more', type: 'button' });
  const syncMore = () => {
    more.hidden = shown >= rows.length;
    more.textContent = `Show all ${num(rows.length)}`;
  };
  more.addEventListener('click', () => { shown = rows.length; renderRows(); syncMore(); });
  syncMore();

  const heading = el('h3', { tabindex: '-1' }, title);
  const panel = el('section', { class: 'evidence', 'aria-label': title },
    el('div', { class: 'evidence-head' }, heading, el('button', { class: 'close', type: 'button', onclick: () => closeEvidence() }, 'Close')),
    el('p', { class: 'note' }, `${num(rows.length)} PRs. ${note}`),
    rows.length === 0 ? el('p', { class: 'note' }, 'None in this group.') :
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { class: 'l' }, 'PR'), el('th', { class: 'l' }, 'Title'), columns.map((c) => el('th', {}, c.label)))),
        tbody)),
    more);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEvidence(); });
  anchor.after(panel);
  trigger.setAttribute('aria-expanded', 'true');
  openPanel = { panel, trigger };
  heading.focus();
}

/** A button that opens the PRs behind a value. */
function evidenceButton(label, anchorOf, spec, extra = {}) {
  const b = el('button', { class: 'num', type: 'button', 'aria-expanded': 'false', ...extra }, label);
  b.addEventListener('click', () => showEvidence(b, anchorOf(b), spec()));
  return b;
}

const byDesc = (key) => (a, b) => (b[key] ?? -1) - (a[key] ?? -1) || a.number - b.number;

function mergedSpec(m, key, label, group) {
  return () => ({
    title: `${group ? `${sigName(group)}: merged` : 'Merged'} PRs by ${label.charAt(0).toLowerCase() + label.slice(1)}, longest first`,
    note: 'Times from ready for review; click a PR to open it on GitHub.',
    rows: m.prs.merged.filter((r) => (!group || r.groups.includes(group)) && r[key] !== null).sort(byDesc(key)),
    columns: [
      { label, value: (r) => dur(r[key]) },
      ...(key === 'cycle' ? [] : [{ label: 'Time to merge', value: (r) => dur(r.cycle) }]),
    ],
  });
}

function openSpec(m, { state, group, rows }) {
  return () => ({
    title: [group ? sigName(group) : 'Open PRs', state ? STATES[state].label.toLowerCase() : null].filter(Boolean).join(': '),
    note: 'Longest waiting first; click a PR to open it on GitHub.',
    rows: (rows ?? m.prs.open.filter((r) => (!state || r.state === state) && (!group || r.groups.includes(group)))).sort(byDesc('waitingDays')),
    columns: [
      ...(state ? [] : [{ label: 'Waiting on', value: (r) => STATES[r.state].label }]),
      ...(state === 'author' ? [{ label: 'Reason', value: (r) => r.reason ?? NA }] : []),
      { label: 'Waiting', value: (r) => dur(r.waitingDays) },
      { label: 'Open for', value: (r) => dur(r.ageDays) },
    ],
  });
}

// ---- derived facts (distinct PRs, so a PR in two SIGs counts once) ----
function reviewShare(m) {
  const queue = m.prs.open.filter((r) => r.state === 'reviewer');
  const sigs = m.bottlenecks.filter((b) => b.state === 'reviewer').slice(0, 2).map((b) => b.sig);
  if (sigs.length < 2 || queue.length === 0) return null;
  const rows = queue.filter((r) => r.groups.some((g) => sigs.includes(g)));
  return { sigs, rows, total: queue.length, share: pct(rows.length, queue.length) };
}

// ---- headline: written from the data so a refreshed snapshot can't strand a stale number ----
function headline(o) {
  const review = o.merged.review.median;
  const merge = o.merged.mergeWait.median;
  if (review === null || merge === null || merge >= 1 || review < 1) return 'Where Kubernetes pull requests wait';
  const days = Math.round(review);
  const hours = Math.ceil(merge * 24);
  return `A Kubernetes pull request waits ${days} ${days === 1 ? 'day' : 'days'} for review, then merges in under ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}
function tailSentence(o) {
  const p90 = o.merged.review.p90;
  if (p90 === null) return '';
  const weeks = Math.round(p90 / 7);
  return weeks >= 2 ? `For 1 in 10, the review wait reaches about ${weeks} weeks. ` : `For 1 in 10, the review wait reaches about ${dur(p90, true)}. `;
}

// ---- the story: four findings, each with the figure that shows it ----
// Each merged PR's days from ready for review to merge, split into consecutive
// stages. Unlike the medians, these add up to the PR's whole wait.
const SEGMENTS = [
  { key: 'first', state: 'untouched', label: 'Waiting for a first response', hint: 'no one but the author has commented' },
  { key: 'lgtm', state: 'reviewer', label: 'Responded, waiting for lgtm', hint: 'a reviewer’s “looks good to me”' },
  { key: 'approved', state: 'approver', label: 'Has lgtm, waiting for approval', hint: 'an approver signs off' },
  { key: 'merge', state: 'merge-pending', label: 'Approved, waiting to merge', hint: 'tests and the merge bot' },
];
function segmentsOf(r) {
  if ([r.firstResponse, r.review, r.approval, r.mergeWait].some((v) => v === null || v === undefined)) return null;
  const first = Math.min(r.firstResponse, r.review);
  return { first, lgtm: r.review - first, approved: Math.max(0, r.approval - r.review), merge: r.mergeWait };
}
/** Share of all waiting days spent in each stage, across these merged PRs. */
function stageSplit(prs) {
  const sums = { first: 0, lgtm: 0, approved: 0, merge: 0 };
  let n = 0;
  for (const r of prs) {
    const s = segmentsOf(r);
    if (!s) continue;
    for (const k in sums) sums[k] += s[k];
    n++;
  }
  const total = sums.first + sums.lgtm + sums.approved + sums.merge;
  if (!n || total <= 0) return null;
  const share = Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, (v / total) * 100]));
  const before = Math.round(share.first + share.lgtm + share.approved);
  return { n, share, before, merge: 100 - before };
}

/** The four findings, computed once so the summary list and the section headings always agree. */
function findings(m) {
  const o = m.overall;
  const b = o.backlog;
  const split = stageSplit(m.prs.merged);
  const reviewSide = b.untouched.count + b.reviewer.count + b.approver.count;
  const totalPd = m.bottlenecks.reduce((a, q) => a + q.prDays, 0);
  const [q1, q2] = m.bottlenecks;
  const teams = Object.keys(m.groups).filter((g) => g !== 'cross-cutting' && g !== 'no-sig')
    .sort((a, c) => m.groups[c].backlog.n - m.groups[a].backlog.n || a.localeCompare(c));
  const active = m.prs.open.filter((r) => r.state !== 'on-hold');
  const topTeams = teams.slice(0, 2);
  const topRows = active.filter((r) => r.groups.some((g) => topTeams.includes(g)));
  const reviewPct = pct(reviewSide, b.n);
  return {
    time: split && {
      split,
      head: `${split.before}% of the waiting happens before anyone approves a change`,
    },
    backlog: {
      reviewSide, reviewPct,
      head: reviewPct > 50 ? 'More than half of the open PRs are waiting on a reviewer' : `${reviewPct}% of the open PRs are waiting on a reviewer`,
    },
    queues: q1 && q2 && {
      share: pct(q1.prDays + q2.prDays, totalPd), totalPd, pair: [q1, q2],
      head: `Two ${q1.state === 'reviewer' && q2.state === 'reviewer' ? 'review queues' : 'queues'} hold ${pct(q1.prDays + q2.prDays, totalPd)}% of all the waiting`,
    },
    teams: topTeams.length === 2 && active.length > 0 && {
      topTeams, rows: topRows, active: active.length, count: teams.length, share: pct(topRows.length, active.length),
      head: `Two of ${teams.length} teams are on ${pct(topRows.length, active.length)}% of the open PRs`,
    },
  };
}

const seeFigure = (id, label) => el('a', { class: 'see', href: `#${id}` }, `See ${label}`);
// A collapsed "how it's measured" layer under a figure: the technical reader opens it.
const howMeasured = (summary, ...body) => el('details', { class: 'how' }, el('summary', {}, summary), ...body);

function opening(m, f) {
  const o = m.overall;
  const share = reviewShare(m);
  const container = el('div', { class: 'opening' });
  const anchor = () => container;

  const list = el('ol', { class: 'findings' },
    el('li', {},
      f.time && el('strong', { class: 'finding-head' }, `${f.time.head}.`), ' ',
      'Getting a reviewer’s lgtm (“looks good to me”) took a median ',
      evidenceButton(dur(o.merged.review.median, true), anchor, mergedSpec(m, 'review', 'Time to lgtm'), { 'aria-label': `${dur(o.merged.review.median, true)}: show merged PRs by time to lgtm` }),
      ', and about ', el('strong', {}, dur(o.merged.review.p90, true)), ' or longer for the slowest 1 in 10. Once both review labels were set, merging took a median ',
      el('strong', {}, dur(o.merged.mergeWait.median, true)), '. ', seeFigure('figure-1', 'Figure 1')),
    el('li', {},
      el('strong', { class: 'finding-head' }, `${f.backlog.head}.`), ' ',
      `${num(f.backlog.reviewSide)} of ${num(o.backlog.n)} open PRs (${f.backlog.reviewPct}%) wait on a reviewer or approver, and `,
      evidenceButton(num(o.backlog.untouched.count), anchor, openSpec(m, { state: 'untouched' }), { 'aria-label': `${num(o.backlog.untouched.count)}: show the open PRs with no human response` }),
      ` open PRs, ${pct(o.backlog.untouched.count, o.backlog.n)}% of the backlog, have had no human response, for a median of ${dur(o.backlog.untouched.waitingDays.median, true)}. `,
      seeFigure('backlog', 'Figure 2')),
    f.queues && el('li', {},
      el('strong', { class: 'finding-head' }, `${f.queues.head}.`), ' ',
      share ? [
        evidenceButton(`${share.share}%`, anchor, openSpec(m, { state: 'reviewer', rows: share.rows }), { 'aria-label': `${share.share}%: show the ${num(share.rows.length)} PRs` }),
        ` of the PRs waiting for review (${num(share.rows.length)} of ${num(share.total)}) belong to sig/${share.sigs[0]} and sig/${share.sigs[1]}. Kubernetes calls its teams SIGs, short for special interest groups. `,
      ] : null,
      seeFigure('queues', 'Figure 3')),
    f.teams && el('li', {},
      el('strong', { class: 'finding-head' }, `${f.teams.head}.`), ' ',
      `Of the ${num(f.teams.active)} open PRs that aren’t on hold, `,
      evidenceButton(num(f.teams.rows.length), anchor, openSpec(m, { rows: f.teams.rows }), { 'aria-label': `${num(f.teams.rows.length)}: show the open PRs labeled for sig/${f.teams.topTeams[0]} or sig/${f.teams.topTeams[1]}` }),
      ` are labeled for sig/${f.teams.topTeams[0]} or sig/${f.teams.topTeams[1]}. `,
      seeFigure('teams', 'Figure 4')),
  );

  container.append(
    el('div', {},
      el('h1', {}, headline(o)),
      el('p', { class: 'byline' },
        'By Gurnek Khaira · Snapshot of ', longDate(m.fetchedAt), ' · ',
        `${num(o.merged.n)} merged and ${num(o.backlog.n)} open pull requests in `,
        el('a', { href: 'https://github.com/kubernetes/kubernetes', target: '_blank', rel: 'noopener' }, m.repo)),
      el('p', { class: 'summary' }, tailSentence(o).trim()),
      el('p', { class: 'plain' },
        'Software teams make changes through “pull requests” (PRs), proposals that a colleague must review and approve before they go in. ',
        'This report looks at Kubernetes, one of the world’s largest open-source projects, and finds that changes spend almost all their time waiting to be reviewed and approved; once approved, they merge within hours. ',
        'It shows which teams’ review queues hold the most waiting, and every number links to the real changes behind it, so anyone can check it.'),
      el('p', { class: 'findings-head' }, 'Key findings'),
      list),
    figureTime(m, f.time));
  return container;
}

// Figure 1: one bar of a merged PR's waiting, split into consecutive stages.
function figureTime(m, time) {
  const stats = m.overall.merged;
  const fig = el('figure', { class: 'figure', id: 'figure-1' });
  const segmentSpec = (seg) => () => ({
    title: `Merged PRs by time ${seg.label.toLowerCase()}, longest first`,
    note: 'Days spent in this stage alone; click a PR to open it on GitHub.',
    rows: m.prs.merged.filter((r) => segmentsOf(r)).map((r) => ({ ...r, stage: segmentsOf(r)[seg.key] })).sort(byDesc('stage')),
    columns: [{ label: 'In this stage', value: (r) => dur(r.stage) }, { label: 'Time to merge', value: (r) => dur(r.cycle) }],
  });
  fig.append(el('h3', {}, 'Figure 1. Where a merged PR’s waiting goes'),
    el('p', { class: 'fig-sub' }, 'Every day from ready for review to merge, split by the stage it was spent in'));
  if (time) {
    const { split } = time;
    fig.append(
      el('p', { class: 'fig-stat' }, `${split.before}% of the waiting comes before a PR is approved. Merging takes the last ${split.merge}%.`),
      el('div', { class: 'strip' }, SEGMENTS.map((seg) => {
        const share = split.share[seg.key];
        const b = el('button', { class: `seg st-${seg.state}`, type: 'button', 'aria-expanded': 'false', style: { flexGrow: String(share) },
          'aria-label': `${seg.label}: ${Math.round(share)}% of all waiting. Show the PRs.` }, el('span', { 'aria-hidden': 'true' }, `${Math.round(share)}%`));
        b.addEventListener('click', () => showEvidence(b, fig, segmentSpec(seg)()));
        return b;
      })),
      el('ul', { class: 'stage-key' }, SEGMENTS.map((seg) => el('li', {},
        el('span', { class: `swatch st-${seg.state}`, 'aria-hidden': 'true' }),
        el('span', {}, el('b', {}, `${Math.round(split.share[seg.key])}% `), seg.label, el('small', {}, seg.hint))))),
      teamStrips(m));
  }
  fig.append(
    howMeasured('Medians, p90 and how it’s measured',
      el('p', {}, 'Per PR, each time below runs from ready for review, so they overlap. The slowest 10% take longer than the p90.'),
      el('div', { class: 'rows' }, STAGES.map((s) => {
        const st = stats[s.key];
        const row = el('button', { class: 'row', type: 'button', 'aria-expanded': 'false',
          'aria-label': `${s.label}: median ${dur(st.median, true)}, slowest 10% over ${dur(st.p90, true)}. Show the PRs.` },
          el('span', { class: 'row-label' }, el('span', {}, s.label), el('span', { class: 'vals' }, `median ${dur(st.median)} · p90 ${dur(st.p90)}`)));
        row.addEventListener('click', () => showEvidence(row, fig, mergedSpec(m, s.key, s.short)()));
        return row;
      })),
      el('ul', {},
        el('li', {}, 'The bar adds up waiting days across PRs, so a PR that waited 60 days counts six times as much as one that waited 10. The medians above give each PR one vote.'),
        el('li', {}, 'If a label is removed and added again, the last add counts, so rework shows up as review time.'),
        el('li', {}, 'Merge wait starts when both labels are set and covers tests and the merge bot.'))),
    el('figcaption', {},
      el('b', {}, 'Source: '), `GitHub API, ${num(time ? time.split.n : stats.n)} of ${num(stats.n)} PRs merged ${shortDate(m.window.from)} to ${longDate(m.window.to)}`,
      time && time.split.n < stats.n ? ` (the other ${num(stats.n - time.split.n)} lack a stage time).` : '.'));
  return fig;
}

/** The same split for the teams with the most merged PRs. */
function teamStrips(m) {
  const teams = Object.keys(m.groups).filter((g) => g !== 'cross-cutting' && g !== 'no-sig')
    .sort((a, b) => m.groups[b].merged.n - m.groups[a].merged.n || a.localeCompare(b)).slice(0, 6)
    .map((g) => ({ g, split: stageSplit(m.prs.merged.filter((r) => r.groups.includes(g))) }))
    .filter((t) => t.split && t.split.n >= m.minSample);
  if (!teams.length) return null;
  return el('div', { class: 'team-strips' },
    el('p', { class: 'team-strips-head' }, `The same split for the ${teams.length} teams with the most merged PRs`),
    teams.map(({ g, split }) => el('div', { class: 'team-strip' },
      el('span', { class: 'name' }, sigName(g)),
      el('span', { class: 'bar', role: 'img', 'aria-label': `${sigName(g)}: ${SEGMENTS.map((s) => `${s.label.toLowerCase()} ${Math.round(split.share[s.key])}%`).join(', ')}` },
        SEGMENTS.map((s) => el('span', { class: `st-${s.state}`, style: { flexGrow: String(split.share[s.key]) } }))),
      el('span', { class: 'pre' }, `${split.before}% before approval`))));
}

// Figure 2: one square per open PR, grouped by whose move it is.
const WAFFLE_GROUPS = [
  { label: 'Reviewers’ and approvers’ move', short: 'Reviewers', states: ['untouched', 'reviewer', 'approver', 'merge-pending'] },
  { label: 'The author’s move', short: 'Author', states: ['author'] },
  { label: 'On hold, parked on purpose', short: 'On hold', states: ['on-hold'] },
];
function figureBacklog(m) {
  const b = m.overall.backlog;
  const fig = el('figure', { class: 'figure', id: 'figure-2' });
  const cols = (n, rows) => Math.max(1, Math.ceil(n / rows));
  const waffle = el('div', { class: 'waffle' }, WAFFLE_GROUPS.map((g) => {
    const states = g.states.filter((s) => b[s].count > 0);
    const n = states.reduce((a, s) => a + b[s].count, 0);
    return el('div', { class: 'wg', vars: { '--c20': states.reduce((a, s) => a + cols(b[s].count, 20), 0), '--c40': states.reduce((a, s) => a + cols(b[s].count, 40), 0) } },
      el('p', { class: 'wg-head' }, el('b', {}, `${num(n)} · ${pct(n, b.n)}%`), el('span', { class: 'long' }, g.label), el('span', { class: 'short' }, g.short)),
      el('div', { class: 'wg-bands' }, states.map((s) => {
        const band = el('button', { class: `band st-${s}`, type: 'button', 'aria-expanded': 'false',
          vars: { '--c20': cols(b[s].count, 20), '--c40': cols(b[s].count, 40) },
          'aria-label': `${num(b[s].count)} PRs ${STATES[s].label.toLowerCase()}. Show them.` },
        Array.from({ length: b[s].count }, () => el('span', { class: 'dot' })));
        band.addEventListener('click', () => showEvidence(band, fig, openSpec(m, { state: s })()));
        return band;
      })));
  }));
  fig.append(
    el('h3', {}, 'Figure 2. Whose move it is, for every open PR'),
    el('p', { class: 'fig-sub' }, `All ${num(b.n)} open PRs, one square each, grouped by who has to act next`),
    waffle,
    el('ul', { class: 'stage-key state-key' }, Object.keys(STATES).map((s) => el('li', {},
      el('span', { class: `swatch st-${s}`, 'aria-hidden': 'true' }),
      el('span', {}, STATES[s].label, ' ',
        evidenceButton(num(b[s].count), () => fig, openSpec(m, { state: s }), { 'aria-label': `${num(b[s].count)} PRs ${STATES[s].label.toLowerCase()}. Show them.` }),
        b[s].waitingDays.median === null ? '' : `, median ${dur(b[s].waitingDays.median)}`,
        el('small', {}, STATES[s].hint))))),
    howMeasured('How each state is decided',
      el('ul', {},
        el('li', {}, 'Each open PR is in exactly one state, worked out from its labels and timeline on the snapshot date. Waits run from the event that put it there.'),
        el('li', {}, 'Bots and the PR’s own author never count as a response.'),
        el('li', {}, 'Labels are a proxy: a PR waiting on a reviewer who is away looks the same as one waiting because the change is hard.'),
        el('li', {}, `The ${num(b['merge-pending'].count)} PR${b['merge-pending'].count === 1 ? '' : 's'} waiting to merge ${b['merge-pending'].count === 1 ? 'is' : 'are'} counted with reviewers and approvers. On-hold PRs (draft, held or rotten) are parked on purpose and never ranked.`))),
    el('figcaption', {}, el('b', {}, 'Source: '), `GitHub API, open PRs on ${longDate(m.fetchedAt)}.`));
  return fig;
}

function backlogNotes(m) {
  const b = m.overall.backlog;
  const reasons = {};
  for (const r of m.prs.open) if (r.state === 'author') reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  const rebase = reasons['needs-rebase'] ?? 0;
  const changes = reasons['changes-requested'] ?? 0;
  return el('div', { class: 'pair notes' },
    el('div', { class: 'aside' },
      el('h3', {}, 'The author’s move is almost as common as the reviewer’s'),
      el('p', {}, `${num(b.author.count)} open PRs are waiting on their author, against ${num(b.reviewer.count)} waiting for a reviewer’s lgtm. Of the author’s queue, ${num(rebase)} need a rebase and only ${num(changes)} have requested changes; the other ${num(b.author.count - rebase - changes)} are waiting on a process label or the contributor licence check, most often a release note.`)),
    el('div', { class: 'aside' },
      el('h3', {}, 'Approvals are not the constraint'),
      el('p', {}, `Only ${num(b.approver.count)} PRs have lgtm and are waiting for an approver, and ${num(b['merge-pending'].count)} ${b['merge-pending'].count === 1 ? 'is' : 'are'} waiting to merge.`)));
}

function backlogSection(m, f) {
  return el('section', { class: 'part', id: 'backlog', 'aria-labelledby': 'backlog-h' },
    el('h2', { id: 'backlog-h' }, `2. ${f.backlog.head}`),
    el('p', { class: 'lede' }, 'Every open PR is waiting on someone: a reviewer, an approver, its own author, or no one because it’s parked. Each square below is one PR. Click a group to see its PRs.'),
    figureBacklog(m),
    backlogNotes(m));
}

// Figure 3: each queue as a block; width is its PRs, height their median wait, so area is PR-days.
function figureQueues(m, top) {
  const fig = el('figure', { class: 'figure', id: 'figure-3' });
  const maxWait = Math.max(...top.map((q) => q.medianWaitDays), 1);
  const step = maxWait > 120 ? 60 : 30;
  const yMax = Math.ceil(maxWait / step) * step;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const states = [...new Set(top.map((q) => q.state))];
  fig.append(
    el('h3', {}, 'Figure 3. The ten largest queues, drawn as PR-days'),
    el('p', { class: 'fig-sub' }, 'Each block’s width is its open PRs and its height is their median wait, so its area is the queue’s PR-days. Numbers match Table 1.'),
    el('ul', { class: 'stage-key inline' }, states.map((s) => el('li', {}, el('span', { class: `swatch st-${s}`, 'aria-hidden': 'true' }), STATES[s].label))),
    el('div', { class: 'qplot' },
      el('div', { class: 'qgrid', 'aria-hidden': 'true' }, ticks.map((t) => el('span', { style: { bottom: `${(t / yMax) * 100}%` } }, t === yMax ? `${t} days` : String(t)))),
      el('div', { class: 'qbars' }, top.map((q) => {
        const bar = el('button', { class: `qbar st-${q.state}`, type: 'button', 'aria-expanded': 'false',
          style: { flexGrow: String(q.count), height: `${(q.medianWaitDays / yMax) * 100}%` },
          'aria-label': `${q.rank}. sig/${q.sig}, ${STATES[q.state].label.toLowerCase()}: ${num(q.count)} PRs, median wait ${dur(q.medianWaitDays, true)}, ${num(q.prDays)} PR-days. Show the PRs.` },
        el('span', { class: 'qrank', 'aria-hidden': 'true' }, String(q.rank)));
        bar.addEventListener('click', () => showEvidence(bar, fig, openSpec(m, { state: q.state, group: q.sig })()));
        return bar;
      }))),
    el('p', { class: 'qaxis' }, 'Width: open PRs in the queue. Height: their median wait.'),
    el('figcaption', {}, el('b', {}, 'Source: '), `open PRs on ${longDate(m.fetchedAt)}. This is one snapshot, not a trend, and it doesn’t measure reviewer capacity.`));
  return fig;
}

function queuesSection(m, f) {
  const top = m.bottlenecks.slice(0, 10);
  const maxPd = Math.max(...top.map((q) => q.prDays), 1);
  const wrap = el('div', { class: 'table-wrap' });
  wrap.append(el('table', { class: 'ranked' },
    el('caption', {}, `Table 1. Source: open PRs on ${longDate(m.fetchedAt)}. PR-days of waiting = open PRs in the queue × their median wait. Queues under ${m.minSample} PRs, on-hold PRs and PRs labeled with more than 3 SIGs are not ranked. Showing ${top.length} of ${m.bottlenecks.length} ranked queues.`),
    el('thead', {}, el('tr', {},
      el('th', { class: 'l', scope: 'col' }, '#'), el('th', { class: 'l', scope: 'col' }, 'Team'), el('th', { class: 'l', scope: 'col' }, 'Waiting on'),
      el('th', { scope: 'col' }, 'Open PRs'), el('th', { scope: 'col' }, 'Median wait'), el('th', { scope: 'col' }, 'PR-days of waiting'), el('th', { class: 'l', scope: 'col' }, 'Longest waiting'))),
    el('tbody', {}, top.map((q) => el('tr', {},
      el('td', { class: 'rank l' }, q.rank),
      el('td', { class: 'l team' }, `sig/${q.sig}`),
      el('td', { class: 'l', 'data-label': 'Waiting on' }, el('span', { class: `swatch st-${q.state}`, 'aria-hidden': 'true' }), STATES[q.state].label, el('span', { class: 'who' }, `next move: ${STATES[q.state].owner}`)),
      el('td', { 'data-label': 'Open PRs' }, evidenceButton(num(q.count), () => wrap, openSpec(m, { state: q.state, group: q.sig }), { 'aria-label': `${num(q.count)} PRs in sig/${q.sig}, ${STATES[q.state].label.toLowerCase()}. Show them.` })),
      el('td', { 'data-label': 'Median wait' }, dur(q.medianWaitDays)),
      el('td', { 'data-label': 'PR-days of waiting' }, el('div', { class: 'pd' }, num(q.prDays), el('span', { class: 'pd-bar', 'aria-hidden': 'true' }, el('span', { style: { width: `${(q.prDays / maxPd) * 100}%` } })))),
      el('td', { class: 'l examples', 'data-label': 'Longest waiting' }, q.examples.map(prLink)))))));
  return el('section', { class: 'part', id: 'queues', 'aria-labelledby': 'queues-h' },
    el('h2', { id: 'queues-h' }, f.queues ? `3. ${f.queues.head}` : '3. The largest queues'),
    el('p', { class: 'lede' }, 'Each open PR sits in one team’s queue for one stage. Queues are ranked by PR-days of waiting, which counts both how many PRs wait and how long: 10 PRs waiting 10 days is 100 PR-days, the same as one PR waiting 100 days. The unit is a team and a stage, never a person, because a long queue reflects capacity and process rather than anyone’s effort.'),
    top.length ? figureQueues(m, top) : null,
    wrap);
}

// Figure 4: open PRs by team and stage; darker cells hold more.
function figureTeams(m) {
  const cols = ['untouched', 'reviewer', 'approver', 'author'];
  const short = { untouched: 'No response', reviewer: 'Review (lgtm)', approver: 'Approval', author: 'Author' };
  const names = Object.keys(m.groups).filter((g) => g !== 'cross-cutting' && g !== 'no-sig' && m.groups[g].backlog.n >= m.minSample)
    .sort((a, b) => m.groups[b].backlog.n - m.groups[a].backlog.n || a.localeCompare(b));
  const max = Math.max(1, ...names.flatMap((g) => cols.map((c) => m.groups[g].backlog[c].count)));
  const fig = el('figure', { class: 'figure', id: 'figure-4' });
  const wrap = el('div', { class: 'heat-wrap' });
  wrap.append(el('table', { class: 'heat' },
    el('thead', {}, el('tr', {},
      el('th', { class: 'l', scope: 'col' }, 'Team ', el('small', {}, 'open PRs')),
      cols.map((c) => el('th', { scope: 'col' }, short[c])))),
    el('tbody', {}, names.map((g) => {
      const s = m.groups[g].backlog;
      return el('tr', {},
        el('th', { class: 'l', scope: 'row' }, sigName(g), el('small', {}, num(s.n))),
        cols.map((c) => {
          const n = s[c].count;
          if (!n) return el('td', { class: 'h0' }, '0');
          const level = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(n / max) * 6)));
          return el('td', { class: `h${level}` }, evidenceButton(num(n), () => fig, openSpec(m, { state: c, group: g }), { 'aria-label': `${num(n)} PRs in ${sigName(g)}, ${STATES[c].label.toLowerCase()}` }));
        }));
    }))));
  fig.append(
    el('h3', {}, 'Figure 4. Open PRs by team and stage'),
    el('p', { class: 'fig-sub' }, `The stronger the blue, the more open PRs are waiting. Teams with ${m.minSample} or more open PRs, largest first.`),
    wrap,
    el('p', { class: 'heat-scale', 'aria-hidden': 'true' }, el('span', {}, '1'), el('i', {}), el('span', {}, `${num(max)} open PRs`)),
    el('figcaption', {}, el('b', {}, 'Source: '), `GitHub API, snapshot of ${longDate(m.fetchedAt)}. A PR labeled with up to 3 SIGs counts toward each team. Cross-cutting PRs (4+ SIGs), PRs with no SIG label and on-hold PRs are in the full table.`));
  return fig;
}

function briefSection(brief) {
  const section = el('section', { class: 'part', id: 'brief', 'aria-labelledby': 'brief-h' }, el('h2', { id: 'brief-h' }, 'Risks brief'));
  if (!brief || !Array.isArray(brief.bullets) || brief.bullets.length === 0) {
    section.append(el('p', { class: 'lede' }, 'No brief for this snapshot. The numbers in this report are unaffected.'));
    return section;
  }
  const allEdits = brief.review?.edits ?? [];
  const corrected = allEdits.filter((e) => /^correction/i.test(e.reason ?? '')).length;
  const reworded = allEdits.length - corrected;
  const editNote = [reworded && `${reworded} bullet${reworded === 1 ? '' : 's'} reworded for clarity`, corrected && `${corrected} corrected`].filter(Boolean).join(', ');
  section.append(
    el('p', { class: 'provenance' },
      `Written by ${brief.model} from this report’s numbers on ${longDate(brief.generatedAt)}. Code checks that every bullet cites PRs and states only numbers that appear in the data, and rejects known misreadings. `,
      brief.review ? `Reviewed by a person on ${longDate(brief.review.reviewedAt)}${editNote ? `; ${editNote}` : ''}.` : 'Not yet reviewed by a person.'),
    el('ul', { class: 'brief-list' }, brief.bullets.map((b) =>
      el('li', {}, b.text, el('span', { class: 'cites' }, 'Cites ', b.prs.map(prLink))))));
  return section;
}

function teamsSection(m, f) {
  const names = Object.keys(m.groups).filter((g) => g !== 'cross-cutting' && g !== 'no-sig')
    .sort((a, b) => m.groups[b].backlog.n - m.groups[a].backlog.n || a.localeCompare(b));
  const special = ['cross-cutting', 'no-sig'].filter((g) => m.groups[g]);
  const wrap = el('div', { class: 'table-wrap' });
  const anchor = () => wrap;
  const cell = (text, spec, label) => (text === NA ? el('td', { class: 'na' }, NA) :
    el('td', {}, spec && text !== '0' ? evidenceButton(text, anchor, spec, { 'aria-label': label }) : text));
  const row = (g) => {
    const s = m.groups[g];
    const n = sigName(g);
    return el('tr', {},
      el('th', { class: 'l', scope: 'row' }, n),
      cell(num(s.merged.n), mergedSpec(m, 'cycle', 'Time to merge', g), `${num(s.merged.n)} merged PRs in ${n}`),
      cell(dur(s.merged.cycle.median), mergedSpec(m, 'cycle', 'Time to merge', g), `Median ready to merged in ${n}`),
      cell(dur(s.merged.review.p90), mergedSpec(m, 'review', 'Time to lgtm', g), `p90 time to lgtm in ${n}`),
      cell(num(s.backlog.n), openSpec(m, { group: g }), `${num(s.backlog.n)} open PRs in ${n}`),
      ...['untouched', 'reviewer', 'approver', 'author'].map((st) =>
        cell(num(s.backlog[st].count), openSpec(m, { state: st, group: g }), `${num(s.backlog[st].count)} PRs in ${n}, ${STATES[st].label.toLowerCase()}`)));
  };
  wrap.append(el('table', {},
    el('caption', {}, `Table 2. Source: GitHub API, snapshot of ${longDate(m.fetchedAt)}. A PR labeled with up to 3 SIGs counts toward each. ${NA} means fewer than ${m.minSample} PRs, too few to report.`),
    el('thead', {},
      el('tr', {}, el('th', { scope: 'col' }), el('th', { scope: 'colgroup', colspan: 3, class: 'l' }, 'Merged in 90 days'), el('th', { scope: 'colgroup', colspan: 5, class: 'l' }, 'Open now')),
      el('tr', {}, el('th', { class: 'l', scope: 'col' }, 'Team'), el('th', { scope: 'col' }, 'PRs'), el('th', { scope: 'col' }, 'Median ready to merged'), el('th', { scope: 'col' }, 'p90 to lgtm'),
        el('th', { scope: 'col' }, 'PRs'), el('th', { scope: 'col' }, 'No response'), el('th', { scope: 'col' }, 'Review'), el('th', { scope: 'col' }, 'Approval'), el('th', { scope: 'col' }, 'Author'))),
    el('tbody', {}, names.map((g, i) => { const tr = row(g); if (i >= TEAMS_SHOWN) tr.hidden = true; return tr; }),
      special.length ? el('tr', { class: 'group-sep' }, el('td', { colspan: 9, class: 'l' }, 'Reported separately, never ranked')) : null,
      special.map(row))));
  let more = null;
  if (names.length > TEAMS_SHOWN) {
    more = el('button', { class: 'show-all', type: 'button' }, `Show all ${names.length} teams`);
    more.addEventListener('click', () => {
      const revealed = [...wrap.querySelectorAll('tbody tr[hidden]')];
      revealed.forEach((tr) => { tr.hidden = false; });
      more.remove();
      // Keep keyboard focus in place: move it to the first team that just appeared.
      const first = revealed[0]?.querySelector('th');
      if (first) { first.tabIndex = -1; first.focus(); }
    });
  }
  return el('section', { class: 'part', id: 'teams', 'aria-labelledby': 'teams-h' },
    el('h2', { id: 'teams-h' }, f.teams ? `4. ${f.teams.head}` : '4. By team'),
    el('p', { class: 'lede' }, 'Kubernetes labels every PR with the teams that own it, which it calls special interest groups (SIGs). The waiting isn’t spread evenly: a few teams hold most of it. Click any number for its PRs.'),
    figureTeams(m),
    howMeasured('Full table: every team, merged and open',
      el('p', {}, `The ${TEAMS_SHOWN} teams with the most open PRs are shown first. Merged columns cover the last 90 days.`),
      wrap, more));
}

function methodSection(m) {
  const doc = (path, text) => el('a', { href: `${REPO_URL}/blob/main/${path}`, target: '_blank', rel: 'noopener' }, text);
  return el('section', { class: 'part', id: 'method', 'aria-labelledby': 'method-h' },
    el('h2', { id: 'method-h' }, 'Method and limits'),
    el('div', { class: 'method' },
      el('div', {},
        el('h3', {}, 'How it was measured'),
        el('ul', {},
          el('li', {}, 'Timelines come straight from GitHub’s API for every PR merged in 90 days and every open PR.'),
          el('li', {}, 'Review and approval are the lgtm and approved labels Kubernetes’ merge bot sets. If a label is removed and added again, the last add counts, so rework shows up as review time.'),
          el('li', {}, 'Bots and the PR’s own author never count as a response.'),
          el('li', {}, `Only medians and p90 are shown. Groups under ${m.minSample} PRs show ${NA} and are never ranked.`),
          el('li', {}, 'Figure 1 is the one exception: it splits each merged PR’s wait into consecutive stages and adds the days up across PRs, so long waits count for more.'))),
      el('div', {},
        el('h3', {}, 'What it can’t show'),
        el('ul', {},
          el('li', {}, 'Labels are a proxy: a PR waiting on a reviewer who is away looks the same as one waiting because the change is hard.'),
          el('li', {}, 'This is one snapshot, not a trend, and it doesn’t measure reviewer capacity.'),
          el('li', {}, 'It names teams and stages, never people.'))),
      el('div', {},
        el('h3', {}, 'Checked against DevStats'),
        el('p', {}, 'Kubernetes’ own DevStats charts PR velocity over time. Recomputing its “time to approve and merge” definitions on this data, for PRs created in August and September 2026, gives the same picture: most of the time goes to waiting for lgtm, and merging after approval takes hours. The medians differ by 16 to 28%; ',
          doc('research/devstats-cross-check.md', 'the cross-check'), ' explains the likely causes.')),
      el('div', {},
        el('h3', {}, 'How it was built'),
        el('p', {}, 'Built by Gurnek Khaira from a ', doc('PRD.md', 'product spec'), ', ',
          doc('docs/adr', 'decision records'), ' and tickets. The ', doc('BUILD-REPORT.md', 'build report'),
          ' covers tests, costs, the security review and what couldn’t be verified.'))));
}

function colophon(m) {
  document.getElementById('colophon').replaceChildren(el('div', { class: 'colophon-inner' },
    el('span', {}, `Snapshot of ${longDate(m.fetchedAt)}. Public GitHub data. Not affiliated with Kubernetes or the CNCF.`),
    el('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, 'Source on GitHub'),
    // Maker signature, shared across gurn3k builds. Only the wordmark links.
    el('div', { class: 'signature' },
      el('span', { class: 'product' },
        el('img', { class: 'product-mark', src: 'favicon.svg', alt: '', width: 18, height: 18 }),
        'Whose Move Is It · © 2026 Gurnek Khaira'),
      el('span', { class: 'maker' }, 'Built by ',
        el('a', { href: MAKER_URL, target: '_blank', rel: 'noopener', 'aria-label': 'gurn3k' },
          el('span', { class: 'maker-mark' }))))));
}

// ---- boot ----
async function load(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

(async () => {
  const main = document.getElementById('report');
  const repoLink = document.getElementById('repo-link');
  repoLink.href = REPO_URL;
  repoLink.target = '_blank';
  repoLink.rel = 'noopener';
  let m;
  try {
    m = await load('data/metrics.json');
  } catch {
    main.replaceChildren(el('p', { class: 'load-error' }, 'The snapshot data couldn’t load. Serve the site folder over HTTP (npm run serve); opening index.html directly won’t work.'));
    return;
  }
  const brief = await load('data/brief.json').catch(() => null);
  const f = findings(m);
  main.replaceChildren(opening(m, f), backlogSection(m, f), queuesSection(m, f), teamsSection(m, f), briefSection(brief), methodSection(m));
  colophon(m);
  // Sections are drawn after load, so the browser's own jump to #backlog found nothing. Do it now.
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) target.scrollIntoView();
})();
