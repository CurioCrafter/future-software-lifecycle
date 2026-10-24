#!/usr/bin/env node
// Simulated team so you can watch the board move. Uses its own folder, never your real state:
//   node lifecycle/server.mjs --dir .lifecycle-demo   (one terminal)
//   node lifecycle/demo.mjs   --dir .lifecycle-demo   (another)
// Humans in the demo are simulated and named "(demo)". In real use, humans approve in the GUI.
import * as L from './core.mjs';

if (!process.argv.includes('--dir')) {
  console.error('Pass --dir .lifecycle-demo so the demo never touches your real board.');
  process.exit(1);
}
const TICK = Number(process.env.DEMO_TICK || 1100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // repeatable demo
const TITLES = ['Fix flaky date test', 'Bump lodash patch', 'Add dark mode toggle', 'Paginate audit log', 'Retry webhook delivery', 'Cache avatar URLs',
  'Validate email on signup', 'Speed up search index', 'Add order export API', 'Fix timezone in invoices', 'Refactor cart totals', 'Add 2FA backup codes',
  'Trim log noise', 'New pricing page copy', 'Handle 429 from payments', 'Add health check endpoint', 'Docs: API auth guide', 'Fix memory leak in worker'];

// --- Seed: two weeks of history so the metrics have a story (output up, reverts down).
const s = L.fresh();
s.floor = { tests: true, flags: true, staged: false, rollback: true };
s.config.trustedAuthors = ['@maya'];
const owners = ['@maya', '@sam', '@lee', '@ana'];
for (let d = 13; d >= 1; d--) {
  const n = 2 + Math.round((13 - d) * 0.6 + rand() * 2);
  for (let i = 0; i < n; i++) {
    const c = L.newChange(s, { title: TITLES[(d * 7 + i) % TITLES.length], tier: i % 3, owner: owners[i % 4], spec: 'x' });
    c.stage = 'shipped'; c.merged = daysAgo(d); c.rounds = rand() < 0.6 + (13 - d) * 0.02 ? 1 : 2;
    c.approvals = Array.from({ length: c.tier }, (_, k) => ({ by: owners[(i + k + 1) % 4] + ' (demo)', human: true }));
    if (rand() < 0.16 - (13 - d) * 0.011) c.reverted = { t: daysAgo(d), reason: 'regression' };
    c.history = true;
  }
}
s.incidents = [
  { id: 'I1', title: 'Checkout down 47 min after cache key change', should: 'Cache key drops currency: EUR and USD carts collide', caught: 'yes' },
  { id: 'I2', title: 'Migration locked users table for 9 min', should: 'ALTER on a 40M-row table without online DDL', caught: 'partly' },
  { id: 'I3', title: 'Leaked staging token in logs', should: 'Logger prints full request headers', caught: 'yes' },
];
L.log(s, 'demo', 'coordinator', 'seeded 13 days of history');
L.save(s);

// --- Live scenario: each script is a list of steps run one per tick, interleaved across changes.
const scripts = [];
const act = (actor, role, text, fn) => ({ actor, role, text, fn });
function story(spec, steps) { scripts.push({ spec, steps, i: 0, id: null }); }

const verify = (cmd = 'npm test', out = '42 passing (3s)') => act('builder-1', 'worker', `ran \`${cmd}\` → exit 0`, (c) => c.evidence.push({ cmd, exit: 0, out, t: new Date().toISOString() }));
const round = () => act('reviewer-a', 'reviewer', 'started AI review round', (c) => c.rounds++);
const find = (text, kind = 'bug') => act(kind === 'security' ? 'sec-agent' : 'reviewer-b', kind === 'security' ? 'security' : 'reviewer', `${kind} finding: ${text}`, (c) => c.findings.push({ id: 'F' + (c.findings.length + 1), kind, text, status: 'open', round: c.rounds }));
const fix = (reason) => act('builder-1', 'worker', reason ? `closed finding: ${reason}` : 'fixed finding', (c) => { const f = c.findings.find((f) => f.status === 'open'); f.status = reason ? 'closed' : 'fixed'; f.reason = reason || ''; });
const sec = () => act('sec-agent', 'security', 'ran security review', (c) => (c.securityRan = true));
const ci = (exit = 0) => act('ci', 'coordinator', `CI → ${exit ? 'FAIL' : 'pass'}`, (c) => (c.ci = { cmd: 'npm run build && npm test', exit, out: exit ? 'TypeError in cart.ts:88' : 'build ok, 214 passing' }));
const agentOk = () => act('reviewer-a', 'reviewer', 'agent approval (does not count)', (c) => c.approvals.push({ by: 'reviewer-a', human: false }));
const human = (who) => act(who + ' (demo)', 'human', 'approved as a human', (c) => c.approvals.push({ by: who + ' (demo)', human: true }));
const flag = (name) => act('builder-1', 'worker', `put behind flag ${name}`, (c) => (c.flag = name));
const ramp = (p) => act('rollout-mgr', 'manager', `ramped to ${p}%`, (c) => (c.ramp = p));
const adv = () => ({ advance: true });
const untilFloor = { until: (st) => L.floorBuilt(st) };
const rethink = (t) => act('builder-2', 'worker', `rethought approach: ${t}`, (c) => (c.rethink = t));
const halt = (who) => act(who + ' (demo)', 'human', 'HALTED the ramp: error rate up', (c) => (c.halted = true));
const revert = () => act('rollout-mgr', 'manager', 'auto-rollback: error spike', (c) => (c.reverted = { t: new Date().toISOString(), reason: 'error spike during ramp' }));

story({ title: 'Fix typo in onboarding docs', tier: 0, owner: '@maya', spec: 'Docs only' },
  [adv(), verify('npm run docs:build', 'built 48 pages'), adv(), round(), adv(), sec(), adv(), ci(), adv(), adv(), untilFloor, adv(), adv(), flag('docs-typo'), adv(), ramp(100), adv()]);
story({ title: 'Rate-limit login attempts', tier: 2, owner: '@sam', spec: '5 failed logins/min per IP → 429; resets after 60s' },
  [adv(), verify(), adv(), round(), find('Counter never resets after the window'), find('IP read from X-Forwarded-For without trusting proxy list', 'security'), fix(), fix(), adv(), sec(), adv(), ci(), adv(), agentOk(), adv(), human('@lee'), human('@ana'), adv(), adv(), flag('login-rate-limit'), adv(), ramp(10), ramp(50), ramp(100), adv()]);
story({ title: 'Cart: apply coupon before tax', tier: 1, owner: '@lee', spec: 'Coupon discount applied to pre-tax subtotal; tests for 3 regions' },
  [adv(), verify(), adv(), round(), find('Rounding differs for JPY'), fix(), round(), find('Negative totals possible with 100% coupon'), fix(), round(), find('Tax recomputed twice'), fix(), round(), find('Coupon stacking breaks again'), rethink('Move all price math into one pure function with property tests'), fix(), adv(), sec(), adv(), ci(), adv(), human('@maya'), adv(), adv(), flag('coupon-pretax'), adv(), ramp(5)]);
story({ title: 'Search results caching', tier: 1, owner: '@ana', spec: 'Cache search for 60s, key on query+locale' },
  [adv(), verify(), adv(), round(), adv(), sec(), adv(), ci(1), ci(0), adv(), human('@sam'), adv(), adv(), flag('search-cache'), adv(), ramp(25), halt('@ana'), revert()]);
story({ title: 'Add CSV export to reports', tier: 1, owner: '@maya', spec: 'Export any report as CSV, max 100k rows' },
  [adv(), verify(), adv(), round(), find('Unescaped commas in names'), fix(), adv(), sec(), adv(), ci(), adv()]);
story({ title: 'Rotate DB credentials monthly', tier: 2, owner: '@lee', spec: 'Rotation job + zero-downtime swap' },
  [adv(), verify(), adv(), round(), adv(), sec(), find('Old credential kept valid forever', 'security')]);

let t = 0;
while (scripts.some((x) => x.i < x.steps.length)) {
  const st = L.load();
  for (const sc of scripts) {
    if (!sc.id && t >= scripts.indexOf(sc) * 2) {
      const c = L.newChange(st, sc.spec); sc.id = c.id;
      L.log(st, 'planner', 'coordinator', `opened "${c.title}" (tier ${c.tier})`, c.id);
      continue;
    }
    if (!sc.id || sc.i >= sc.steps.length || rand() < 0.35) continue;
    const c = L.find(st, sc.id), step = sc.steps[sc.i++];
    if (step.until) { if (!step.until(st)) sc.i--; continue; }
    if (step.advance) {
      const b = L.advance(st, c);
      L.log(st, 'coordinator', 'coordinator', b.length ? `blocked: ${b[0]}` : `advanced to ${c.stage}`, c.id);
    } else { step.fn(c); L.log(st, step.actor, step.role, step.text, c.id); }
  }
  if (t === 20) { st.floor.staged = true; L.log(st, '@maya (demo)', 'human', 'floor: staged releases built'); }
  L.save(st);
  t++;
  await sleep(TICK);
}
console.log('demo finished');
