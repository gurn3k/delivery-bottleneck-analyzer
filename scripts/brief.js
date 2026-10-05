import { readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import {
  buildInput, citationGroups, buildMessages, parseBrief, validateBrief, cleanBullets, estimateCost,
  MAX_OUTPUT_TOKENS, COST_CAP_USD, ATTEMPTS, RESPONSE_FORMAT,
} from '../src/brief.js';

const OUT = 'site/data/brief.json';
const API = 'https://openrouter.ai/api/v1';
const dryRun = process.argv.includes('--dry-run');
const model = process.env.OPENROUTER_MODEL;
const usd = (x) => `US$${x.toFixed(4)}`;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!model) fail('OPENROUTER_MODEL is not set, e.g. OPENROUTER_MODEL=google/gemini-2.5-flash-lite');

const metrics = JSON.parse(await readFile('site/data/metrics.json', 'utf8'));
const input = buildInput(metrics);
const groups = citationGroups(input);

// Prices come from OpenRouter's public model list, so the estimate tracks price changes.
const models = await fetch(`${API}/models`).then((r) => (r.ok ? r.json() : fail(`OpenRouter model list: HTTP ${r.status}`)));
const info = models.data.find((m) => m.id === model);
if (!info) fail(`Unknown OpenRouter model: ${model}`);

const perAttempt = estimateCost(buildMessages(input, ['(room for retry feedback)']), info.pricing);
const worstCase = perAttempt.usd * ATTEMPTS;
console.log(`Model: ${model}`);
console.log(`Estimated cost: about ${perAttempt.inputTokens.toLocaleString()} input + up to ${MAX_OUTPUT_TOKENS} output tokens = ${usd(perAttempt.usd)} per attempt, ${usd(worstCase)} worst case with ${ATTEMPTS} attempts. Cap: ${usd(COST_CAP_USD)}.`);
if (worstCase > COST_CAP_USD) fail(`Worst case is over the ${usd(COST_CAP_USD)} cap. Not calling the model. Choose a cheaper model.`);
if (dryRun) {
  console.log(`Dry run: ${new Set(groups.flat()).size} citable PRs. No call made.`);
  process.exit(0);
}

const key = process.env.OPENROUTER_API_KEY;
if (!key) fail('OPENROUTER_API_KEY is not set.');

async function complete(messages) {
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    // Low reasoning effort keeps reasoning models from spending the whole output
    // budget thinking. Models without reasoning ignore it.
    body: JSON.stringify({
      model, messages, max_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: 'low' }, usage: { include: true },
      // Route only to providers that honour the JSON schema.
      response_format: RESPONSE_FORMAT, provider: { require_parameters: true },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return { text: body.choices?.[0]?.message?.content ?? '', cost: body.usage?.cost ?? null, usage: body.usage };
}

let feedback = null;
let spent = 0;
for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  let reply;
  try {
    reply = await complete(buildMessages(input, feedback));
  } catch (err) {
    console.error(`Attempt ${attempt}: ${err.message}`);
    feedback = null;
    continue;
  }
  if (reply.cost !== null) spent += reply.cost;
  console.log(`Attempt ${attempt}: ${reply.usage?.prompt_tokens ?? '?'} in / ${reply.usage?.completion_tokens ?? '?'} out tokens, cost ${reply.cost === null ? 'not reported' : usd(reply.cost)}`);
  // Rejected replies are kept locally (data/raw is gitignored) so failures can be diagnosed.
  const keepRejected = async (why) => {
    await mkdir('data/raw', { recursive: true });
    await writeFile(`data/raw/brief-rejected-${attempt}.txt`, `${why}\n\n${reply.text}`);
  };
  let brief;
  try {
    brief = parseBrief(reply.text);
  } catch (err) {
    feedback = [`could not parse JSON: ${err.message}`];
    await keepRejected(feedback[0]);
    console.error(`Attempt ${attempt} rejected: ${feedback[0]}`);
    continue;
  }
  const { ok, errors } = validateBrief(brief, groups);
  if (!ok) {
    feedback = errors;
    await keepRejected(errors.join('\n'));
    console.error(`Attempt ${attempt} rejected:\n  ${errors.join('\n  ')}`);
    continue;
  }
  const out = {
    generatedAt: new Date().toISOString(),
    model,
    metricsFetchedAt: metrics.fetchedAt,
    costUsd: spent,
    bullets: cleanBullets(brief.bullets),
  };
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT}: ${out.bullets.length} bullets. Total cost ${usd(spent)}.`);
  process.exit(0);
}

// No valid brief: remove last week's so it is never shown next to new numbers.
await rm(OUT, { force: true });
console.error(`No valid brief after ${ATTEMPTS} attempts. Omitted this week; metrics are unaffected. Total cost ${usd(spent)}.`);
process.exit(0);
