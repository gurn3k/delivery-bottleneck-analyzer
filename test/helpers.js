export const user = (login) => ({ login, bot: false });
export const AUTHOR = user('author1');

export function pr({ events = [], labels = [], createdAt = '2026-09-01T00:00:00Z', mergedAt = null, isDraft = false } = {}) {
  return { number: 1, author: AUTHOR, createdAt, mergedAt, isDraft, labels, events };
}

export const labeled = (at, label) => ({ type: 'labeled', at, label });
export const unlabeled = (at, label) => ({ type: 'unlabeled', at, label });
export const comment = (at, actor) => ({ type: 'comment', at, actor });
export const review = (at, actor, state = 'COMMENTED') => ({ type: 'review', at, actor, state });
