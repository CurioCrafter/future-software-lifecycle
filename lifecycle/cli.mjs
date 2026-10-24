#!/usr/bin/env node
// The agent's hands on the board. Every command records who did what, so the GUI can show it live.
// Human-only actions (human approval, halting a ramp) are NOT here: they happen in the GUI.
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import * as L from './core.mjs';

const HELP = `lifecycle <command> [args]

  init                                   create .lifecycle/state.json
  status [--json]                        board summary with blockers
  show <id>                              one change in full
  new --title T --owner @human --tier 0|1|2 [--spec S]
  spec <id> --text S                     set spec / acceptance criteria
  evidence <id> --cmd "npm test"         RUN a command, record real output (self-verify)
  round <id>                             start an AI review round
  finding <id> --kind bug|security --text T [--by name]
  resolve <id> <findingId> (--fixed | --closed "reason")
  security <id> [--clean]                mark security review run
  rethink <id> --text T                  record the new approach after the round limit
  ci <id> --cmd "npm run build"          RUN CI command, record pass/fail
  approve <id> --by agent-name           agent approval (recorded, never counts)
  flag <id> --name F                     feature flag for the internal release
  ramp <id> --pct N                      raise rollout % (humans can halt in the GUI)
  advance <id>                           move to next stage if no blockers
  revert <id> --reason R
  incident --title T --should "what a reviewer should have said" [--change id]
  score <incidentId> yes|partly|no       record whether the AI reviewer caught it
  decision <decisionId> --level none|on|in|licensed [--owner @x]
  floor --tests|--flags|--staged|--rollback yes|no
  trust @human                           add a trusted author (tier 0 eligible)

Common: --actor NAME (default "claude"), --role worker|reviewer|security|coordinator|manager
`;

const { positionals, values: o } = parseArgs({
  allowPositionals: true, strict: false,
  options: {
    json: { type: 'boolean' }, fixed: { type: 'boolean' }, clean: { type: 'boolean' },
    ...Object.fromEntries('title owner tier spec text cmd kind by closed name pct reason should change level actor role tests flags staged rollback dir'
      .split(' ').map((k) => [k, { type: 'string' }])),
  },
});
const [cmd, a1, a2] = positionals;
const actor = o.actor || 'claude', role = o.role || 'worker';

function run(command) {
  const r = spawnSync(command, { shell: true, encoding: 'utf8', maxBuffer: 50e6 });
  const out = ((r.stdout || '') + (r.stderr || '')).slice(-4000);
  return { cmd: command, exit: r.status ?? 1, out, t: new Date().toISOString() };
}

const s = L.load();
const c = () => L.find(s, a1);
let print = '';
let write = !['init', 'status', 'show'].includes(cmd);

try {
  switch (cmd) {
    case 'init': L.save(L.fresh()); print = `Created ${L.FILE}`; break;
    case 'status': {
      if (o.json) { print = JSON.stringify({ changes: s.changes.map((x) => ({ ...x, blockers: L.blockers(s, x) })), metrics: L.metrics(s), floor: s.floor }, null, 2); break; }
      const m = L.metrics(s);
      print = `Floor: ${L.floorBuilt(s) ? 'BUILT' : 'not built (' + Object.entries(s.floor).filter(([, v]) => !v).map(([k]) => k).join(', ') + ' missing)'}\n`;
      print += `Merged ${m.merged}, reverted ${m.reverted} (${(m.revertRate * 100).toFixed(0)}%)\n\n`;
      for (const x of s.changes.filter((x) => !x.reverted && x.stage !== 'shipped'))
        print += `${x.id} [${x.stage}] T${x.tier} ${x.title} (${x.owner})\n${L.blockers(s, x).map((b) => '   - ' + b).join('\n')}\n`;
      break;
    }
    case 'show': print = JSON.stringify({ ...c(), blockers: L.blockers(s, c()) }, null, 2); break;
    case 'new': {
      const x = L.newChange(s, { title: o.title, tier: o.tier ?? 1, owner: o.owner, spec: o.spec });
      L.log(s, actor, role, `opened "${x.title}" (tier ${x.tier}, owner ${x.owner})`, x.id);
      print = x.id; break;
    }
    case 'spec': c().spec = o.text; L.log(s, actor, role, 'wrote the spec', a1); break;
    case 'evidence': {
      if (!o.cmd) throw new Error('--cmd required: evidence must be a real run');
      const r = run(o.cmd); c().evidence.push(r);
      L.log(s, actor, role, `ran \`${o.cmd}\` → exit ${r.exit}`, a1);
      print = r.out + `\n[exit ${r.exit}]`; break;
    }
    case 'round': {
      const x = c(); x.rounds++;
      L.log(s, actor, 'reviewer', `started AI review round ${x.rounds}`, a1);
      if (x.rounds > s.config.maxRounds) print = `Round ${x.rounds} is past the limit of ${s.config.maxRounds}. Stop fixing findings one by one: rethink the approach and record it with \`rethink\`.`;
      break;
    }
    case 'finding': {
      const x = c(), f = { id: 'F' + (x.findings.length + 1), kind: o.kind || 'bug', text: o.text, by: o.by || actor, status: 'open', round: x.rounds };
      x.findings.push(f); L.log(s, o.by || actor, f.kind === 'security' ? 'security' : 'reviewer', `${f.kind} finding: ${o.text}`, a1);
      print = f.id; break;
    }
    case 'resolve': {
      const f = c().findings.find((f) => f.id === a2);
      if (!f) throw new Error('No finding ' + a2);
      if (!o.fixed && !o.closed) throw new Error('--fixed or --closed "reason" required');
      f.status = o.fixed ? 'fixed' : 'closed'; f.reason = o.closed || '';
      L.log(s, actor, role, `${f.status} ${f.id}${f.reason ? ': ' + f.reason : ''}`, a1); break;
    }
    case 'security': c().securityRan = true; L.log(s, actor, 'security', 'ran security review', a1); break;
    case 'rethink': c().rethink = o.text; L.log(s, actor, role, `rethought the approach: ${o.text}`, a1); break;
    case 'ci': {
      const r = run(o.cmd || 'echo no CI command'); c().ci = r;
      L.log(s, actor, 'coordinator', `CI \`${r.cmd}\` → ${r.exit === 0 ? 'pass' : 'FAIL'}`, a1);
      print = r.out + `\n[exit ${r.exit}]`; break;
    }
    case 'approve':
      c().approvals.push({ by: o.by || actor, human: false, t: new Date().toISOString() });
      L.log(s, o.by || actor, 'reviewer', 'agent approval (does not count toward required approvals)', a1);
      print = 'Recorded. Agent approvals never count; a human approves in the GUI.'; break;
    case 'flag': c().flag = o.name; L.log(s, actor, role, `put behind flag ${o.name}`, a1); break;
    case 'ramp': {
      const x = c();
      if (x.halted) throw new Error('A human halted this ramp in the GUI');
      x.ramp = Math.min(100, Number(o.pct)); L.log(s, actor, 'manager', `ramped to ${x.ramp}%`, a1); break;
    }
    case 'advance': {
      const x = c(), b = L.advance(s, x);
      if (b.length) { print = 'Blocked:\n' + b.map((y) => ' - ' + y).join('\n'); process.exitCode = 2; }
      else { L.log(s, actor, 'coordinator', `advanced to ${x.stage}`, a1); print = `→ ${x.stage}`; }
      break;
    }
    case 'revert': c().reverted = { t: new Date().toISOString(), reason: o.reason || '' }; L.log(s, actor, role, `REVERTED: ${o.reason}`, a1); break;
    case 'incident': {
      const i = { id: 'I' + (s.incidents.length + 1), title: o.title, should: o.should, change: o.change || null, caught: null };
      s.incidents.push(i); L.log(s, actor, 'security', `incident → test case ${i.id}: ${o.title}`); print = i.id; break;
    }
    case 'score': {
      const i = s.incidents.find((i) => i.id === a1); i.caught = a2;
      L.log(s, actor, 'reviewer', `reviewer scored on ${a1}: ${a2}`); break;
    }
    case 'decision': {
      const d = s.decisions.find((d) => d.id === a1);
      if (!L.LEVELS.includes(o.level)) throw new Error('--level none|on|in|licensed');
      d.level = o.level; if (o.owner) d.owner = o.owner;
      L.log(s, actor, 'manager', `mapped "${d.name}" → ${o.level}`); break;
    }
    case 'floor':
      for (const k of Object.keys(s.floor)) if (o[k]) s.floor[k] = o[k] === 'yes' || o[k] === true;
      L.log(s, actor, 'coordinator', `floor: ${JSON.stringify(s.floor)}`); break;
    case 'trust': s.config.trustedAuthors.push(a1); L.log(s, actor, 'manager', `trusted author ${a1}`); break;
    default: print = HELP; write = false;
  }
  if (write) L.save(s);
} catch (e) {
  console.error('Error: ' + e.message); process.exit(1);
}
if (print) console.log(print);
