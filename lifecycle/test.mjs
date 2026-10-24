// Rule self-check: node lifecycle/test.mjs
import assert from 'node:assert/strict';
import { fresh, newChange, required, blockers, advance } from './core.mjs';

const s = fresh();
const c = newChange(s, { title: 't', tier: 0, owner: '@a', spec: 'x' });
assert.equal(required(s, c), 1, 'tier 0 needs a human until the floor is built');
s.floor = { tests: true, flags: true, staged: true, rollback: true };
s.config.trustedAuthors = ['@a'];
assert.equal(required(s, c), 0, 'tier 0 + floor + trusted author = no human');

c.tier = 2; c.stage = 'approval';
c.approvals.push({ by: 'reviewer-bot', human: false });
assert.ok(blockers(s, c)[0].includes('has 0'), 'agent approval must not count');
c.approvals.push({ by: '@x', human: true }, { by: '@y', human: true });
assert.deepEqual(advance(s, c), []);
assert.equal(c.stage, 'merge_queue');

c.stage = 'ai_review'; c.rounds = 4;
assert.ok(blockers(s, c).some((x) => x.includes('rethink')), 'round limit');
c.findings.push({ kind: 'security', status: 'open' }); c.stage = 'security'; c.securityRan = true;
assert.ok(blockers(s, c).length, 'open security finding blocks');
console.log('ok');
