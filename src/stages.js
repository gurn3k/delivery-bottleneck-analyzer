import { isBot } from './bots.js';
import { hoursBetween, laterOf } from './time.js';

/** When the PR became reviewable: the last ready-for-review event, or creation. */
export function readyTime(pr) {
  const ready = pr.events.filter((e) => e.type === 'ready').at(-1);
  return ready ? ready.at : pr.createdAt;
}

/** A human other than the PR author. */
export const isReviewerActor = (pr, actor) => !isBot(actor) && actor.login !== pr.author?.login;

/** First comment or review by a human other than the author, at any time. */
export function firstHumanResponse(pr) {
  const e = pr.events.find((e) => (e.type === 'comment' || e.type === 'review') && isReviewerActor(pr, e.actor));
  return e ? e.at : null;
}

/**
 * The time a label was last added and never removed afterwards, up to `cutoff`.
 * Null if the label was not on the PR at the cutoff, or the add event is missing.
 */
export function finalLabelAdd(pr, label, cutoff = null) {
  let at = null;
  for (const e of pr.events) {
    if (cutoff && e.at > cutoff) break;
    if (e.label !== label) continue;
    if (e.type === 'labeled') at = e.at;
    if (e.type === 'unlabeled') at = null;
  }
  return at;
}

/** Stage durations in hours for a merged PR. Missing stages are null, never 0. */
export function stageDurations(pr) {
  const ready = readyTime(pr);
  const responded = firstHumanResponse(pr);
  const lgtm = finalLabelAdd(pr, 'lgtm', pr.mergedAt);
  const approved = finalLabelAdd(pr, 'approved', pr.mergedAt);
  const gatesMet = laterOf(lgtm, approved);
  return {
    firstResponse: responded ? hoursBetween(ready, laterOf(ready, responded)) : null,
    review: hoursBetween(ready, lgtm),
    approval: hoursBetween(ready, approved),
    mergeWait: hoursBetween(gatesMet, pr.mergedAt),
    cycle: hoursBetween(ready, pr.mergedAt),
  };
}
