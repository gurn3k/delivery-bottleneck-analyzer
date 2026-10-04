import { readyTime, finalLabelAdd, firstHumanResponse, isReviewerActor } from './stages.js';
import { hoursBetween, laterOf } from './time.js';

export const STATES = ['on-hold', 'author', 'untouched', 'reviewer', 'approver', 'merge-pending'];

const HOLD_LABELS = new Set(['do-not-merge/hold', 'do-not-merge/work-in-progress', 'lifecycle/rotten']);

function latestDecisiveReview(pr) {
  return pr.events
    .filter((e) => e.type === 'review' && isReviewerActor(pr, e.actor))
    .filter((e) => e.state === 'APPROVED' || e.state === 'CHANGES_REQUESTED')
    .at(-1);
}

/** Whose move it is on an open PR, and since when (ISO time). */
export function classify(pr) {
  const labels = new Set(pr.labels);
  const ready = readyTime(pr);

  if (pr.isDraft || [...labels].some((l) => HOLD_LABELS.has(l))) {
    return { state: 'on-hold', since: ready };
  }
  if (labels.has('needs-rebase')) {
    return { state: 'author', reason: 'needs-rebase', since: finalLabelAdd(pr, 'needs-rebase') ?? ready };
  }
  const process = [...labels].find((l) => l.startsWith('do-not-merge/'));
  if (process || labels.has('cncf-cla: no')) {
    return { state: 'author', reason: process ?? 'cncf-cla: no', since: ready };
  }
  const review = latestDecisiveReview(pr);
  if (review?.state === 'CHANGES_REQUESTED') {
    return { state: 'author', reason: 'changes-requested', since: review.at };
  }
  if (!firstHumanResponse(pr)) return { state: 'untouched', since: ready };
  if (!labels.has('lgtm')) return { state: 'reviewer', since: ready };
  const lgtm = finalLabelAdd(pr, 'lgtm') ?? ready;
  if (!labels.has('approved')) return { state: 'approver', since: lgtm };
  return { state: 'merge-pending', since: laterOf(lgtm, finalLabelAdd(pr, 'approved') ?? ready) };
}

export function backlogEntry(pr, now) {
  const c = classify(pr);
  return {
    ...c,
    ageDays: hoursBetween(readyTime(pr), now) / 24,
    waitingDays: hoursBetween(c.since, now) / 24,
  };
}
