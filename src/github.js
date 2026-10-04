const ENDPOINT = 'https://api.github.com/graphql';

let pointsUsed = 0;
export const getPointsUsed = () => pointsUsed;

export async function graphql(query, variables = {}, attempt = 1) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set. Locally: export GITHUB_TOKEN=$(gh auth token)');
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const retryable = res.status === 502 || res.status === 503 || res.status === 403;
  if (!res.ok) {
    if (retryable && attempt < 4) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return graphql(query, variables, attempt + 1);
    }
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  if (body.errors) {
    if (attempt < 4 && body.errors.some((e) => /timeout|something went wrong/i.test(e.message))) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return graphql(query, variables, attempt + 1);
    }
    throw new Error(`GitHub GraphQL error: ${JSON.stringify(body.errors)}`);
  }
  if (body.data.rateLimit) pointsUsed += body.data.rateLimit.cost;
  return body.data;
}
