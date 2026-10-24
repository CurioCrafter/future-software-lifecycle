// Shared state + rules for the lifecycle board. Used by the CLI, the server and the autopilot.
import fs from 'node:fs';
import path from 'node:path';

const flag = process.argv.indexOf('--dir');
export const DIR = path.resolve(flag > 0 ? process.argv[flag + 1] : process.env.LIFECYCLE_DIR || '.lifecycle');
export const FILE = path.join(DIR, 'state.json');

// The pipeline, grouped by the six verification layers in BLUEPRINT.md.
export const STAGES = [
  { id: 'spec', label: 'Spec', layer: 'Upstream' },
  { id: 'verify', label: 'Self-verify', layer: '1 Verify' },
  { id: 'ai_review', label: 'AI review', layer: '2 AI review' },
  { id: 'security', label: 'Security', layer: '3 Security' },
  { id: 'ci', label: 'CI', layer: '4 CI' },
  { id: 'approval', label: 'Human approval', layer: '5 Risk tier' },
  { id: 'merge_queue', label: 'Merge queue', layer: '6 Ship' },
  { id: 'internal', label: 'Internal (flag)', layer: '6 Ship' },
  { id: 'ramp', label: 'Ramp', layer: '6 Ship' },
  { id: 'shipped', label: 'Shipped', layer: 'Done' },
];
export const LEVELS = ['none', 'on', 'in', 'licensed'];

const DECISIONS = [
  ['Whether to build something at all', 'in', 'Upstream'],
  ['Spec and acceptance criteria', 'in', 'Upstream'],
  ['Splitting an approved spec into tasks', 'on', 'Upstream'],
  ['A design or API that sets a pattern', 'in', 'Upstream'],
  ['Adding a new external dependency', 'in', 'Upstream'],
  ['Writing the code and the tests', 'none', 'Building'],
  ['Lint, formatting, patch bumps', 'none', 'Building'],
  ['Answering AI findings, rounds 1-3', 'none', 'Building'],
  ['Review loop past round 3', 'in', 'Building'],
  ['Tier 0: docs and typos', 'none', 'Review'],
  ['Tier 1: ordinary change', 'in', 'Review'],
  ['Tier 2: auth, payments, infra', 'in', 'Review'],
  ['Overriding a security finding', 'in', 'Review'],
  ['Ship to internal users behind a flag', 'none', 'Release'],
  ['Ramp a flag to everyone', 'on', 'Release'],
  ['Automatic rollback on error spike', 'none', 'Release'],
  ['Incident triage and paging', 'on', 'Release'],
  ['Declaring an incident resolved', 'in', 'Release'],
  ['Granting production access', 'in', 'Security'],
  ['Rotating a leaked secret', 'none', 'Security'],
  ['Irreversible data deletion', 'in', 'Data'],
  ['Paying an invoice that matches its PO', 'none', 'Business'],
  ['Changing prices or customer terms', 'in', 'Business'],
  ['Hiring and firing', 'in', 'Business'],
  ['Releasing safety-critical software', 'licensed', 'Licensed'],
  ['Financial statement sign-off', 'licensed', 'Licensed'],
].map(([name, level, area], i) => ({ id: 'D' + (i + 1), name, level, area, owner: '' }));

export function fresh() {
  return {
    config: { approvals: { 0: 0, 1: 1, 2: 2 }, maxRounds: 3, trustedAuthors: [] },
    floor: { tests: false, flags: false, staged: false, rollback: false },
    changes: [], decisions: DECISIONS, incidents: [], log: [], seq: 0,
  };
}

export function load() {
  if (!fs.existsSync(FILE)) return fresh();
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

export function save(s) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, FILE); // atomic, so the GUI never reads half a file
}

export function log(s, actor, role, text, changeId) {
  s.log.push({ t: new Date().toISOString(), actor, role, text, change: changeId || null });
  if (s.log.length > 500) s.log.splice(0, s.log.length - 500);
}

export const floorBuilt = (s) => Object.values(s.floor).every(Boolean);

export function find(s, id) {
  const c = s.changes.find((c) => c.id === id);
  if (!c) throw new Error(`No change ${id}`);
  return c;
}

export function newChange(s, { title, tier = 1, owner, spec = '' }) {
  if (!title) throw new Error('--title is required');
  if (!owner) throw new Error('--owner is required: the human who prompted the agent owns the change');
  tier = Number(tier);
  if (![0, 1, 2].includes(tier)) throw new Error('--tier must be 0, 1 or 2');
  const c = {
    id: 'C' + ++s.seq, title, tier, owner, spec, stage: 'spec', created: new Date().toISOString(),
    evidence: [], findings: [], rounds: 0, rethink: '', ci: null,
    approvals: [], flag: '', ramp: 0, halted: false, reverted: null, merged: null,
  };
  s.changes.push(c);
  return c;
}

// Human approvals a change needs. Tier 0 only skips humans when the floor is built and the author is trusted.
export function required(s, c) {
  if (c.tier === 0 && !(floorBuilt(s) && s.config.trustedAuthors.includes(c.owner))) return 1;
  return s.config.approvals[c.tier];
}

const humanCount = (c) => c.approvals.filter((a) => a.human).length;

// What stops a change leaving its current stage. Empty list = it may advance.
export function blockers(s, c) {
  const b = [];
  const open = (kind) => c.findings.filter((f) => f.kind === kind && f.status === 'open');
  switch (c.stage) {
    case 'spec':
      if (!c.spec) b.push('No spec: write acceptance criteria a machine can check');
      break;
    case 'verify':
      if (!c.evidence.length) b.push('No evidence: run tests/build with `evidence` (claims do not count)');
      else if (c.evidence.at(-1).exit !== 0) b.push('Last evidence run failed');
      break;
    case 'ai_review':
      if (c.rounds === 0) b.push('No AI review round run yet');
      if (open('bug').length) b.push(`${open('bug').length} open finding(s): fix or close with a reason`);
      if (c.rounds > s.config.maxRounds && !c.rethink) b.push(`Past ${s.config.maxRounds} rounds: step back and rethink the approach`);
      break;
    case 'security':
      if (!c.securityRan) b.push('Security review not run');
      if (open('security').length) b.push(`${open('security').length} open security finding(s) block merge`);
      break;
    case 'ci':
      if (!c.ci) b.push('CI not run');
      else if (c.ci.exit !== 0) b.push('CI failing');
      break;
    case 'approval': {
      const need = required(s, c), have = humanCount(c);
      if (have < need) b.push(`Needs ${need} human approval(s), has ${have}. Agent approvals never count`);
      break;
    }
    case 'merge_queue': // re-run every earlier gate against the final state
      for (const st of ['verify', 'ai_review', 'security', 'ci', 'approval'])
        b.push(...blockers(s, { ...c, stage: st }).map((x) => 'Re-check: ' + x));
      break;
    case 'internal':
      if (!c.flag) b.push('No feature flag: ship behind a flag to internal users first');
      break;
    case 'ramp':
      if (c.halted) b.push('Ramp halted by a human');
      if (c.ramp < 100) b.push(`Ramp at ${c.ramp}%`);
      break;
    case 'shipped':
      b.push('Already shipped');
  }
  if (c.reverted) b.push('Reverted');
  return b;
}

export function advance(s, c) {
  const b = blockers(s, c);
  if (b.length) return b;
  const i = STAGES.findIndex((x) => x.id === c.stage);
  c.stage = STAGES[i + 1].id;
  if (c.stage === 'internal') c.merged = new Date().toISOString();
  return [];
}

// Daily merged/reverted counts and the guardrail ratio.
export function metrics(s) {
  const days = {};
  const day = (t) => t.slice(0, 10);
  for (const c of s.changes) {
    if (c.merged) (days[day(c.merged)] ??= { merged: 0, reverted: 0 }).merged++;
    if (c.reverted) (days[day(c.reverted.t)] ??= { merged: 0, reverted: 0 }).reverted++;
  }
  const merged = s.changes.filter((c) => c.merged).length;
  const reverted = s.changes.filter((c) => c.reverted).length;
  const reviewed = s.changes.filter((c) => c.rounds > 0);
  const oneRound = reviewed.filter((c) => c.rounds === 1).length;
  const caught = s.incidents.filter((i) => i.caught === 'yes').length;
  return {
    merged, reverted,
    revertRate: merged ? reverted / merged : 0,
    oneRoundRate: reviewed.length ? oneRound / reviewed.length : 0,
    humanApprovals: s.changes.reduce((n, c) => n + humanCount(c), 0),
    incidentCatchRate: s.incidents.length ? caught / s.incidents.length : 0,
    days: Object.entries(days).sort().map(([d, v]) => ({ day: d, ...v })),
  };
}
