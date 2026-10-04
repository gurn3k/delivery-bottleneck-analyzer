// Kubernetes automation accounts. Some are typed as regular GitHub users, so the
// GraphQL actor type alone misses them (verified 2026-10-04 on k8s-ci-robot).
export const BOT_LOGINS = new Set([
  'k8s-ci-robot',
  'k8s-triage-robot',
  'k8s-github-robot',
  'kubernetes-prow',
  'openshift-merge-robot',
  'linux-foundation-easycla',
  'copilot-pull-request-reviewer',
  'dependabot',
]);

export const isBot = (actor) => !actor || actor.bot || BOT_LOGINS.has(actor.login);
