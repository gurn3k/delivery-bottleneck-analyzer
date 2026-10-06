// The public report. Everything is built from data/metrics.json and data/brief.json;
// every number that has PRs behind it opens them in an inline evidence panel.

// The public repository. Confirm at launch; the page links here for source and method.
const REPO_URL = 'https://github.com/gurn3k/delivery-bottleneck-analyzer';
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
const STATES = {
  untouched: { label: 'No human response yet', owner: 'reviewers', hint: 'no comment or review from anyone but the author' },
  reviewer: { label: 'Waiting for a reviewer’s lgtm', owner: 'reviewers', hint: 'someone responded; no lgtm yet' },
  approver: { label: 'Waiting for an approver', owner: 'approvers', hint: 'has lgtm; not yet approved' },
  'merge-pending': { label: 'Waiting to merge', owner: 'CI and the merge queue', hint: 'both labels set' },
  author: { label: 'Waiting on the author', owner: 'the PR’s author', hint: 'rebase, requested changes or a process label' },
  'on-hold': { label: 'On hold', owner: 'parked on purpose', hint: 'draft, held or rotten' },
};
const ACTIVE_STATES = ['untouched', 'reviewer', 'approver', 'merge-pending', 'author'];

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

// ---- sections ----
function opening(m) {
  const o = m.overall;
  const share = reviewShare(m);
  const container = el('div', { class: 'opening' });
  const anchor = () => container;

  const findings = el('ul', { class: 'findings' },
    el('li', {}, 'Getting a reviewer’s lgtm (“looks good to me”) took a median ',
      evidenceButton(dur(o.merged.review.median, true), anchor, mergedSpec(m, 'review', 'Time to lgtm')),
      ', and about ', el('strong', {}, dur(o.merged.review.p90, true)), ' or longer for the slowest 1 in 10. Once both review labels were set, merging took a median ',
      el('strong', {}, dur(o.merged.mergeWait.median, true)), '.'),
    share && el('li', {},
      evidenceButton(`${share.share}%`, anchor, openSpec(m, { state: 'reviewer', rows: share.rows })),
      ` of the PRs waiting for review (${num(share.rows.length)} of ${num(share.total)}) belong to two teams, sig/${share.sigs[0]} and sig/${share.sigs[1]}. Kubernetes calls its teams SIGs, short for special interest groups.`),
    el('li', {},
      evidenceButton(num(o.backlog.untouched.count), anchor, openSpec(m, { state: 'untouched' })),
      ` open PRs, ${pct(o.backlog.untouched.count, o.backlog.n)}% of the backlog, have had no human response, for a median of ${dur(o.backlog.untouched.waitingDays.median, true)}.`),
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
      findings),
    figureTime(m));
  return container;
}

function figureTime(m) {
  const stats = m.overall.merged;
  const max = Math.max(...STAGES.map((s) => stats[s.key].p90 ?? 0), 1);
  const fig = el('figure', { class: 'figure', id: 'figure-1' });
  const width = (v) => `${((v ?? 0) / max) * 100}%`;
  fig.append(
    el('h3', {}, 'Figure 1. Where a merged PR’s time goes'),
    el('p', { class: 'fig-sub' }, 'Days from ready for review, by stage'),
    el('p', { class: 'key', 'aria-hidden': 'true' },
      el('span', {}, el('span', { class: 'swatch median' }), 'Median'),
      el('span', {}, el('span', { class: 'swatch p90' }), 'Slowest 10% take longer than this (p90)')),
    el('div', { class: 'rows' }, STAGES.map((s) => {
      const st = stats[s.key];
      const row = el('button', { class: 'row', type: 'button', 'aria-expanded': 'false',
        'aria-label': `${s.label}: median ${dur(st.median, true)}, slowest 10% over ${dur(st.p90, true)}. Show the PRs.` },
        el('span', { class: 'row-label' }, el('span', {}, s.label), el('span', { class: 'vals' }, `median ${dur(st.median)} · p90 ${dur(st.p90)}`)),
        el('span', { class: 'track', 'aria-hidden': 'true' },
          el('span', { class: 'p90', style: { width: width(st.p90) } }),
          el('span', { class: 'median', style: { width: width(st.median) } })),
        s.key === 'mergeWait' ? el('span', { class: 'row-note' }, `Merging itself is quick: a median ${dur(st.median, true)}.`) : null);
      row.addEventListener('click', () => showEvidence(row, fig, mergedSpec(m, s.key, s.short)()));
      return row;
    })),
    el('figcaption', {},
      el('b', {}, 'Source: '), `GitHub API, ${num(stats.n)} PRs merged ${shortDate(m.window.from)} to ${longDate(m.window.to)}. `,
      'Each stage is measured from ready for review, so the stages overlap. Merge wait starts when both labels are set.'));
  return fig;
}

function figureBacklog(m) {
  const b = m.overall.backlog;
  const max = Math.max(...ACTIVE_STATES.map((s) => b[s].count), 1);
  const fig = el('figure', { class: 'figure', id: 'figure-2' });
  const stateRow = (s) => {
    const info = STATES[s];
    return el('div', { class: 'state-row' },
      el('div', { class: 'state-name' }, info.label, el('small', {}, info.hint)),
      el('div', { class: 'state-bar' },
        el('span', { class: 'bar', style: { width: `calc((100% - 150px) * ${b[s].count / max})` }, 'aria-hidden': 'true' }),
        evidenceButton(num(b[s].count), () => fig, openSpec(m, { state: s }), { 'aria-label': `${num(b[s].count)} PRs ${info.label.toLowerCase()}. Show them.` }),
        el('span', { class: 'wait' }, b[s].waitingDays.median === null ? '' : `median ${dur(b[s].waitingDays.median)}`)));
  };
  fig.append(
    el('h3', {}, 'Figure 2. Whose move the open PRs are waiting on'),
    el('p', { class: 'fig-sub' }, `All ${num(b.n)} open PRs, each in exactly one state`),
    el('div', { class: 'state-rows' }, ACTIVE_STATES.map(stateRow)),
    el('div', { class: 'parked state-rows' }, stateRow('on-hold')),
    el('figcaption', {}, el('b', {}, 'Source: '), `GitHub API, open PRs on ${longDate(m.fetchedAt)}. Waits run from the event that put each PR in its state. On-hold PRs are parked on purpose and never ranked.`));
  return fig;
}

function backlogNote(m) {
  const b = m.overall.backlog;
  const reasons = {};
  for (const r of m.prs.open) if (r.state === 'author') reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  return el('div', { class: 'aside' },
    el('h3', {}, 'The author’s move is as common as the reviewer’s'),
    el('p', {}, `${num(b.author.count)} open PRs are waiting on their author, against ${num(b.reviewer.count)} waiting for a reviewer’s lgtm. Of the author’s queue, ${num(reasons['needs-rebase'] ?? 0)} need a rebase and only ${num(reasons['changes-requested'] ?? 0)} have requested changes; the other ${num(b.author.count - (reasons['needs-rebase'] ?? 0) - (reasons['changes-requested'] ?? 0))} are waiting on a process label or the contributor licence check, most often a release note.`),
    el('p', {}, `Approvals are not the constraint. Only ${num(b.approver.count)} PRs have lgtm and are waiting for an approver, and ${num(b['merge-pending'].count)} ${b['merge-pending'].count === 1 ? 'is' : 'are'} waiting to merge.`));
}

function queuesSection(m) {
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
      el('td', { class: 'l', 'data-label': 'Waiting on' }, STATES[q.state].label, el('span', { class: 'who' }, `next move: ${STATES[q.state].owner}`)),
      el('td', { 'data-label': 'Open PRs' }, evidenceButton(num(q.count), () => wrap, openSpec(m, { state: q.state, group: q.sig }), { 'aria-label': `${num(q.count)} PRs in sig/${q.sig}, ${STATES[q.state].label.toLowerCase()}. Show them.` })),
      el('td', { 'data-label': 'Median wait' }, dur(q.medianWaitDays)),
      el('td', { 'data-label': 'PR-days of waiting' }, el('div', { class: 'pd' }, num(q.prDays), el('span', { class: 'pd-bar', 'aria-hidden': 'true' }, el('span', { style: { width: `${(q.prDays / maxPd) * 100}%` } })))),
      el('td', { class: 'l examples', 'data-label': 'Longest waiting' }, q.examples.map(prLink)))))));
  return el('section', { class: 'part', id: 'queues', 'aria-labelledby': 'queues-h' },
    el('h2', { id: 'queues-h' }, 'The largest queues'),
    el('p', { class: 'lede' }, 'Each open PR sits in one team’s queue for one stage. Ranking queues by PR-days of waiting puts the ones with many PRs waiting a long time first. The unit is a team and a stage, never a person, because a long queue reflects capacity and process rather than anyone’s effort.'),
    wrap,
    el('div', { class: 'pair pair-backlog' }, figureBacklog(m), backlogNote(m)));
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

function teamsSection(m) {
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
  if (names.length > TEAMS_SHOWN) {
    const more = el('button', { class: 'show-all', type: 'button' }, `Show all ${names.length} teams`);
    more.addEventListener('click', () => {
      const revealed = [...wrap.querySelectorAll('tbody tr[hidden]')];
      revealed.forEach((tr) => { tr.hidden = false; });
      more.remove();
      // Keep keyboard focus in place: move it to the first team that just appeared.
      const first = revealed[0]?.querySelector('th');
      if (first) { first.tabIndex = -1; first.focus(); }
    });
    return el('section', { class: 'part', id: 'teams', 'aria-labelledby': 'teams-h' },
      el('h2', { id: 'teams-h' }, 'By team'),
      el('p', { class: 'lede' }, `Every Kubernetes PR is labeled with the special interest groups (SIGs) that own it. The ${TEAMS_SHOWN} teams with the most open PRs are shown first. Click any number for its PRs.`),
      wrap, more);
  }
  return el('section', { class: 'part', id: 'teams', 'aria-labelledby': 'teams-h' },
    el('h2', { id: 'teams-h' }, 'By team'),
    el('p', { class: 'lede' }, 'Every Kubernetes PR is labeled with the special interest groups (SIGs) that own it. Click any number for its PRs.'),
    wrap);
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
          el('li', {}, `Only medians and p90 are shown. Groups under ${m.minSample} PRs show ${NA} and are never ranked.`))),
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
        el('p', {}, 'Built by Gurnek Khaira with AI coding agents (Claude Code), from a ', doc('PRD.md', 'product spec'), ', ',
          doc('docs/adr', 'decision records'), ' and tickets. The ', doc('BUILD-REPORT.md', 'build report'),
          ' covers tests, costs, the security review and what couldn’t be verified.'))));
}

function colophon(m) {
  document.getElementById('colophon').replaceChildren(el('div', { class: 'colophon-inner' },
    el('span', {}, `Snapshot of ${longDate(m.fetchedAt)}. Public GitHub data. Not affiliated with Kubernetes or the CNCF.`),
    el('span', {}, 'Built by Gurnek Khaira · ', el('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, 'Source on GitHub'))));
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
  main.replaceChildren(opening(m), queuesSection(m), briefSection(brief), teamsSection(m), methodSection(m));
  colophon(m);
})();
