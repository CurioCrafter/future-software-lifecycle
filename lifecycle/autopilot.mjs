#!/usr/bin/env node
// API mode: runs the review layers (2 and 3) with the Claude API and posts results to the board.
// Costs API tokens on your own key. Never approves as a human and never merges.
//
//   cd lifecycle && npm install            (once, installs @anthropic-ai/sdk)
//   export ANTHROPIC_API_KEY=...           (or `ant auth login`)
//   node lifecycle/autopilot.mjs C3 [--base main] [--reviewers 3] [--test "npm test"]
//
// LIFECYCLE_MODEL picks the model (default claude-opus-5-5; claude-sonnet-5-5 is cheaper).
import { parseArgs } from 'node:util';
import { execFileSync, spawnSync } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import * as L from './core.mjs';

const { positionals: [id], values: o } = parseArgs({
  allowPositionals: true,
  options: { base: { type: 'string', default: 'main' }, reviewers: { type: 'string', default: '3' }, test: { type: 'string' }, dir: { type: 'string' } },
});
if (!id) { console.error('usage: autopilot.mjs <changeId> [--base main] [--reviewers 3] [--test "npm test"]'); process.exit(1); }

const MODEL = process.env.LIFECYCLE_MODEL || 'claude-opus-5-5';
const client = new Anthropic();

const FINDINGS = {
  type: 'object', additionalProperties: false, required: ['findings'],
  properties: { findings: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['file', 'problem', 'why'],
    properties: { file: { type: 'string' }, problem: { type: 'string' }, why: { type: 'string' } },
  } } },
};
const VOTES = {
  type: 'object', additionalProperties: false, required: ['votes'],
  properties: { votes: { type: 'array', items: { type: 'boolean' } } },
};

async function ask(system, prompt, schema) {
  const r = await client.beta.messages.create({
    model: MODEL, max_tokens: 16000, system,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  });
  if (r.stop_reason === 'refusal') throw new Error('Model declined: ' + (r.stop_details?.explanation || r.stop_details?.category));
  return JSON.parse(r.content.find((b) => b.type === 'text').text);
}

function post(fn) { const s = L.load(); fn(s, L.find(s, id)); L.save(s); }

const s0 = L.load(), c0 = L.find(s0, id);
const diff = execFileSync('git', ['diff', `${o.base}...HEAD`], { encoding: 'utf8', maxBuffer: 50e6 });
if (!diff.trim()) { console.error(`Empty diff against ${o.base}`); process.exit(1); }
const context = `Change: ${c0.title}\nSpec / acceptance criteria:\n${c0.spec}\n\nDiff:\n${diff}`;

// Layer 1: real evidence, if a test command was given.
if (o.test) {
  const r = spawnSync(o.test, { shell: true, encoding: 'utf8', maxBuffer: 50e6 });
  const ev = { cmd: o.test, exit: r.status ?? 1, out: ((r.stdout || '') + (r.stderr || '')).slice(-4000), t: new Date().toISOString() };
  post((s, c) => { c.evidence.push(ev); L.log(s, 'autopilot', 'worker', `ran \`${o.test}\` → exit ${ev.exit}`, id); });
}

// Layer 2: several reviewers hunt in parallel, separate voters keep only findings most agree are real.
if (c0.rounds >= s0.config.maxRounds && !c0.rethink) {
  console.log(`Round limit (${s0.config.maxRounds}) reached. Step back and rethink the approach, record it with \`cli.mjs rethink\`, then rerun.`);
  process.exit(2);
}
post((s, c) => { c.rounds++; L.log(s, 'autopilot', 'reviewer', `AI review round ${c.rounds} (${o.reviewers} reviewers, ${MODEL})`, id); });

const n = Number(o.reviewers);
const hunt = 'You review a code change. Report only real bugs that would cause wrong behaviour, data loss or a failed acceptance criterion. No style nits. Report everything you believe is real; a separate vote filters noise.';
const raw = (await Promise.all(Array.from({ length: n }, () => ask(hunt, context, FINDINGS)))).flatMap((r) => r.findings);
console.log(`${raw.length} candidate finding(s) from ${n} reviewers`);

if (raw.length) {
  const list = raw.map((f, i) => `${i}. [${f.file}] ${f.problem}: ${f.why}`).join('\n');
  const judge = 'You verify review findings. For each numbered finding, vote true only if it is a real problem in this diff. Return one boolean per finding, in order.';
  const ballots = await Promise.all(Array.from({ length: n }, () => ask(judge, `${context}\n\nFindings:\n${list}`, VOTES)));
  const kept = raw.filter((_, i) => ballots.filter((b) => b.votes[i]).length > n / 2);
  post((s, c) => {
    for (const f of kept) {
      c.findings.push({ id: 'F' + (c.findings.length + 1), kind: 'bug', text: `${f.file}: ${f.problem}`, by: 'autopilot', status: 'open', round: c.rounds });
      L.log(s, 'autopilot', 'reviewer', `finding: ${f.file}: ${f.problem}`, id);
    }
    L.log(s, 'autopilot', 'reviewer', `vote kept ${kept.length} of ${raw.length}`, id);
  });
  console.log(`Kept ${kept.length} after voting`);
}

// Layer 3: security review. Open security findings block merge.
const secPrompt = 'You are a security reviewer. Report only exploitable security problems introduced by this diff (injection, authz gaps, secrets, unsafe deserialization, SSRF, etc.).';
const sec = (await ask(secPrompt, context, FINDINGS)).findings;
post((s, c) => {
  c.securityRan = true;
  for (const f of sec) c.findings.push({ id: 'F' + (c.findings.length + 1), kind: 'security', text: `${f.file}: ${f.problem}`, by: 'autopilot', status: 'open', round: c.rounds });
  L.log(s, 'autopilot', 'security', `security review: ${sec.length} finding(s)`, id);
});
console.log(`Security: ${sec.length} finding(s). Fix or close each with a reason, then run autopilot again for the next round.`);
