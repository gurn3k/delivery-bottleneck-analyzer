const STAGES = [
  { key: 'firstResponse', label: 'First response', hint: 'ready → first human comment' },
  { key: 'review', label: 'Review', hint: 'ready → final lgtm' },
  { key: 'approval', label: 'Approval', hint: 'ready → final approved' },
  { key: 'mergeWait', label: 'Merge wait', hint: 'both gates → merged (CI, queue)' },
];
const STATE_INFO = {
  untouched: { label: 'No human response', owner: 'reviewers', hint: 'no comment or review yet' },
  reviewer: { label: 'Waiting on review', owner: 'reviewers', hint: 'responded, no lgtm' },
  approver: { label: 'Waiting on approval', owner: 'approvers', hint: 'lgtm, no approved' },
  'merge-pending': { label: 'Waiting to merge', owner: 'CI / merge queue', hint: 'both gates met' },
  author: { label: 'Waiting on author', owner: 'author', hint: 'rebase, changes, process label' },
  'on-hold': { label: 'On hold', owner: 'parked', hint: 'draft, hold or rotten' },
};
const STATE_ORDER = ['untouched', 'reviewer', 'approver', 'merge-pending', 'author', 'on-hold'];
const PR_URL = (n) => `https://github.com/kubernetes/kubernetes/pull/${n}`;
const NA = '—';

// ---- formatting ----
const num = (n) => (n === null || n === undefined ? NA : n.toLocaleString('en-US'));
function dur(days) {
  if (days === null || days === undefined) return NA;
  if (days < 1) return `${(days * 24).toFixed(1)} h`;
  if (days < 10) return `${days.toFixed(1)} d`;
  return `${Math.round(days).toLocaleString('en-US')} d`;
}
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const sigName = (g) => (g === 'cross-cutting' ? 'Cross-cutting (4+ SIGs)' : g === 'no-sig' ? 'No SIG label' : `sig/${g}`);

// ---- tiny DOM helper: text is always set via textContent, never innerHTML ----
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
function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'dark' ? 'Light theme' : 'Dark theme';
}
try { const saved = localStorage.getItem('theme'); if (saved) applyTheme(saved); } catch {}
themeBtn.textContent = currentTheme() === 'dark' ? 'Light theme' : 'Dark theme';
themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('theme', next); } catch {}
});

// ---- tooltip ----
const tip = document.getElementById('tooltip');
function attachTip(node, text) {
  node.addEventListener('pointermove', (e) => {
    tip.textContent = text;
    tip.style.opacity = '1';
    const x = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${e.clientY + 16}px`;
  });
  node.addEventListener('pointerleave', () => { tip.style.opacity = '0'; });
}

// ---- drill-down ----
const dlg = document.getElementById('drill');
document.getElementById('drill-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

function openDrill(title, note, rows, columns) {
  document.getElementById('drill-title').textContent = title;
  document.getElementById('drill-note').textContent = `${note} ${rows.length.toLocaleString('en-US')} PRs.`;
  const body = document.getElementById('drill-body');
  body.replaceChildren(
    rows.length === 0
      ? el('p', { class: 'empty' }, 'No PRs in this group.')
      : el('div', { class: 'table-wrap' },
          el('table', {},
            el('thead', {}, el('tr', {}, el('th', {}, 'PR'), el('th', { class: 'left' }, 'Title'), columns.map((c) => el('th', {}, c.label)))),
            el('tbody', {}, rows.map((r) =>
              el('tr', {}, el('td', {}, prLink(r.number)), el('td', { class: 'title-cell' }, r.title ?? ''),
                columns.map((c) => el('td', { class: c.value(r) === NA ? 'na' : null }, c.value(r)))))))
        )
  );
  dlg.showModal();
  body.scrollTop = 0;
}

const byDesc = (key) => (a, b) => (b[key] ?? -1) - (a[key] ?? -1) || a.number - b.number;
const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label ?? 'Cycle time';

function drillMerged(m, stageKey, group) {
  const rows = m.prs.merged.filter((r) => (!group || r.groups.includes(group)) && r[stageKey] !== null).sort(byDesc(stageKey));
  const where = group ? `${sigName(group)}, merged` : 'Merged';
  openDrill(`${where} PRs by ${stageLabel(stageKey).toLowerCase()}`, 'Longest first.', rows, [
    { label: stageLabel(stageKey), value: (r) => dur(r[stageKey]) },
    ...(stageKey === 'cycle' ? [] : [{ label: 'Cycle time', value: (r) => dur(r.cycle) }]),
  ]);
}

function drillOpen(m, { state, group }) {
  const rows = m.prs.open.filter((r) => (!state || r.state === state) && (!group || r.groups.includes(group))).sort(byDesc('waitingDays'));
  const parts = [group && sigName(group), state && STATE_INFO[state].label].filter(Boolean);
  openDrill(`Open PRs: ${parts.join(', ') || 'all'}`, 'Longest waiting first.', rows, [
    ...(state ? [] : [{ label: 'State', value: (r) => STATE_INFO[r.state].label }]),
    ...(state === 'author' ? [{ label: 'Reason', value: (r) => r.reason ?? NA }] : []),
    { label: 'Waiting', value: (r) => dur(r.waitingDays) },
    { label: 'Age', value: (r) => dur(r.ageDays) },
  ]);
}

// ---- sections ----
function tiles(m) {
  const o = m.overall;
  const tile = (cls, label, value, unit, detail, onclick) =>
    el('button', { class: `tile ${cls}`, type: 'button', onclick },
      el('div', { class: 'label' }, label),
      el('div', { class: 'value' }, value, unit ? el('small', {}, unit) : null),
      el('div', { class: 'detail' }, detail));
  const days = (d) => (d === null ? NA : d < 10 ? d.toFixed(1) : Math.round(d).toString());
  return el('section', { class: 'tiles', 'aria-label': 'Headline numbers' },
    tile('hero', 'Median time to merge', days(o.merged.cycle.median), o.merged.cycle.median === null ? '' : 'days',
      `Ready for review → merged. ${num(o.merged.n)} PRs merged in 90 days.`, () => drillMerged(m, 'cycle')),
    tile('', 'Review wait for the slowest 1 in 10', days(o.merged.review.p90), o.merged.review.p90 === null ? '' : 'days',
      `p90, ready → final lgtm. Median ${dur(o.merged.review.median)}.`, () => drillMerged(m, 'review')),
    tile('', 'Open PRs with no human response', num(o.backlog.untouched.count), '',
      `Median wait ${dur(o.backlog.untouched.waitingDays.median)}, of ${num(o.backlog.n)} open.`, () => drillOpen(m, { state: 'untouched' })),
  );
}

function stageChart(m) {
  const stats = m.overall.merged;
  const max = Math.max(...STAGES.map((s) => stats[s.key].p90 ?? 0), 1);
  const bar = (value, color, label) => {
    const line = el('div', { class: 'bar-line' },
      el('div', { class: 'bar', style: { width: `calc(${((value ?? 0) / max) * 100}% - 70px * ${((value ?? 0) / max)})`, background: color } }),
      el('span', { class: 'bar-val' }, dur(value)));
    return line;
  };
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'How long each review stage takes'),
      el('p', { class: 'note' }, `Merged PRs, ${fmtDate(m.window.from)} to ${fmtDate(m.window.to)}. Each stage is measured from ready for review, so they overlap. Click a stage for its PRs.`)),
    el('div', { class: 'legend' },
      el('span', { class: 'key' }, el('span', { class: 'swatch', style: { background: 'var(--series-1)' } }), 'Median'),
      el('span', { class: 'key' }, el('span', { class: 'swatch', style: { background: 'var(--series-2)' } }), 'p90 (1 in 10 PRs is slower)')),
    el('div', { class: 'bars' }, STAGES.map((s) => {
      const st = stats[s.key];
      const row = el('button', { class: 'bar-row', type: 'button', onclick: () => drillMerged(m, s.key) },
        el('span', { class: 'bar-label' }, s.label, el('span', { class: 'hint' }, s.hint)),
        el('span', { class: 'bar-stack' }, bar(st.median, 'var(--series-1)'), bar(st.p90, 'var(--series-2)')));
      attachTip(row, `${s.label}: median ${dur(st.median)}, p90 ${dur(st.p90)} (${num(st.n)} PRs)`);
      return row;
    })));
}

function backlogChart(m) {
  const b = m.overall.backlog;
  const max = Math.max(...STATE_ORDER.map((s) => b[s].count), 1);
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'Open backlog: whose move is it?'),
      el('p', { class: 'note' }, `All ${num(b.n)} open PRs on ${fmtDate(m.fetchedAt)}, each in one state. Click a state for its PRs.`)),
    el('div', { class: 'bars' }, STATE_ORDER.map((s) => {
      const info = STATE_INFO[s];
      const frac = b[s].count / max;
      const row = el('button', { class: 'bar-row', type: 'button', onclick: () => drillOpen(m, { state: s }) },
        el('span', { class: 'bar-label' }, info.label, el('span', { class: 'hint' }, info.hint)),
        el('span', { class: 'bar-line' },
          el('span', { class: 'bar single', style: { width: `calc(${frac * 100}% - 150px * ${frac})`, background: 'var(--series-1)' } }),
          el('span', { class: 'bar-val' }, `${num(b[s].count)} · median wait ${dur(b[s].waitingDays.median)}`)));
      attachTip(row, `${info.label}: ${num(b[s].count)} PRs. Median wait ${dur(b[s].waitingDays.median)}, p90 ${dur(b[s].waitingDays.p90)}. Owner: ${info.owner}.`);
      return row;
    })));
}

function bottleneckTable(m) {
  const top = m.bottlenecks.slice(0, 10);
  const maxPd = Math.max(...top.map((b) => b.prDays), 1);
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'Biggest bottlenecks'),
      el('p', { class: 'note' }, `Team and stage queues ranked by PR-days of waiting: open PRs in the queue × their median wait. Queues under ${m.minSample} PRs, on-hold PRs and cross-cutting PRs are not ranked. Showing ${top.length} of ${m.bottlenecks.length}.`)),
    top.length === 0 ? el('p', { class: 'empty' }, 'No queue has enough PRs to rank.') :
    el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { class: 'left' }, '#'), el('th', { class: 'left' }, 'Team'), el('th', { class: 'left' }, 'Queue'),
        el('th', {}, 'Open PRs'), el('th', {}, 'Median wait'), el('th', {}, 'PR-days'), el('th', { class: 'left' }, 'Longest waiting'))),
      el('tbody', {}, top.map((b) => el('tr', {},
        el('td', { class: 'rank left' }, b.rank),
        el('td', { class: 'left' }, `sig/${b.sig}`),
        el('td', { class: 'left' }, STATE_INFO[b.state].label, el('div', { class: 'owner' }, `owner: ${STATE_INFO[b.state].owner}`)),
        el('td', {}, el('button', { type: 'button', onclick: () => drillOpen(m, { state: b.state, group: b.sig }) }, num(b.count))),
        el('td', {}, dur(b.medianWaitDays)),
        el('td', {}, el('div', { class: 'pd-cell' }, num(b.prDays),
          el('span', { class: 'pd-track', 'aria-hidden': 'true' }, el('span', { class: 'pd-fill', style: { width: `${(b.prDays / maxPd) * 100}%`, display: 'block' } })))),
        el('td', { class: 'left examples' }, b.examples.map(prLink))))))));
}

function sigTable(m) {
  const names = Object.keys(m.groups).filter((g) => g !== 'cross-cutting' && g !== 'no-sig')
    .sort((a, b) => m.groups[b].backlog.n - m.groups[a].backlog.n || a.localeCompare(b));
  const special = ['cross-cutting', 'no-sig'].filter((g) => m.groups[g]);
  const cell = (text, onclick) => (text === NA ? el('td', { class: 'na' }, NA) : el('td', {}, onclick ? el('button', { type: 'button', onclick }, text) : text));
  const row = (g) => {
    const s = m.groups[g];
    return el('tr', {},
      el('td', { class: 'left' }, sigName(g)),
      cell(num(s.merged.n), s.merged.n ? () => drillMerged(m, 'cycle', g) : null),
      cell(dur(s.merged.cycle.median), s.merged.cycle.median !== null ? () => drillMerged(m, 'cycle', g) : null),
      cell(dur(s.merged.review.p90), s.merged.review.p90 !== null ? () => drillMerged(m, 'review', g) : null),
      cell(num(s.backlog.n), s.backlog.n ? () => drillOpen(m, { group: g }) : null),
      ...['untouched', 'reviewer', 'approver', 'author'].map((st) =>
        cell(num(s.backlog[st].count), s.backlog[st].count ? () => drillOpen(m, { state: st, group: g }) : null)));
  };
  return el('section', { class: 'card' },
    el('div', { class: 'card-head' },
      el('h2', {}, 'By team (SIG)'),
      el('p', { class: 'note' }, `A PR labeled with up to 3 SIGs counts toward each. — means fewer than ${m.minSample} PRs, too few to report. Click any number for its PRs.`)),
    el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {},
        el('tr', {}, el('th', {}), el('th', { colspan: 3, class: 'left' }, 'Merged, 90 days'), el('th', { colspan: 5, class: 'left' }, 'Open now')),
        el('tr', {}, el('th', { class: 'left' }, 'Team'), el('th', {}, 'PRs'), el('th', {}, 'Median cycle'), el('th', {}, 'p90 review'),
          el('th', {}, 'PRs'), el('th', {}, 'No response'), el('th', {}, 'On review'), el('th', {}, 'On approval'), el('th', {}, 'On author'))),
      el('tbody', {}, names.map(row),
        special.length ? el('tr', { class: 'sep' }, el('td', { colspan: 9 }, 'Reported separately, not ranked')) : null,
        special.map(row)))));
}

function briefPanel(brief) {
  const head = el('div', { class: 'card-head' }, el('h2', {}, 'Risks brief'));
  if (!brief || !Array.isArray(brief.bullets) || brief.bullets.length === 0) {
    return el('section', { class: 'card brief' }, head, el('p', { class: 'empty' }, 'No brief for this snapshot. The numbers above are unaffected.'));
  }
  const edits = brief.review?.edits?.length ?? 0;
  const reviewed = brief.review
    ? ` Reviewed by a person on ${fmtDate(brief.review.reviewedAt)}${edits ? `; ${edits} bullet${edits === 1 ? '' : 's'} reworded for clarity` : ''}.`
    : '';
  head.append(el('p', { class: 'note' }, `Written by ${brief.model} from the numbers on this page on ${fmtDate(brief.generatedAt)}. Every bullet cites PRs, and checks reject any citation or number that isn't in the data.${reviewed}`));
  return el('section', { class: 'card brief' }, head,
    el('ul', {}, brief.bullets.map((b) => el('li', {}, b.text, ' ', el('span', { class: 'cites' }, '(', b.prs.flatMap((n, i) => [i ? ', ' : '', prLink(n)]), ')')))));
}

// ---- boot ----
async function load(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

(async () => {
  const app = document.getElementById('app');
  let m;
  try {
    m = await load('data/metrics.json');
  } catch (err) {
    document.getElementById('subtitle').textContent = '';
    app.replaceChildren(el('div', { class: 'error' }, 'Could not load data/metrics.json. Run npm run metrics, then serve the site folder (npm run serve). Opening the file directly will not work.'));
    return;
  }
  const brief = await load('data/brief.json').catch(() => null);
  document.getElementById('subtitle').textContent =
    `${m.repo}, by team (SIG) and review stage. Data from public GitHub, fetched ${fmtDate(m.fetchedAt)}.`;
  document.getElementById('min-sample').textContent = m.minSample;
  app.replaceChildren(tiles(m), briefPanel(brief), bottleneckTable(m), stageChart(m), backlogChart(m), sigTable(m));
})();
