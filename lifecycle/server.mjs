#!/usr/bin/env node
// Local dashboard: node lifecycle/server.mjs [--port 4317]
// Watches .lifecycle/state.json and streams every change to the browser (Server-Sent Events).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './core.mjs';

const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 4317;
const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public', 'index.html');

function view() {
  const s = L.load();
  return {
    ...s, stages: L.STAGES, floorBuilt: L.floorBuilt(s), metrics: L.metrics(s),
    changes: s.changes.map((c) => ({ ...c, blockers: L.blockers(s, c), required: L.required(s, c) })),
  };
}

// Actions only a person takes, from the GUI. Agents use the CLI and cannot do these.
// ponytail: localhost-only process guard, not security. Real enforcement is branch protection.
const HUMAN = {
  approve(s, b) {
    const c = L.find(s, b.id), who = (b.who || '').trim();
    if (!who) throw new Error('Type your name to approve');
    if (c.approvals.some((a) => a.human && a.by === who)) throw new Error(`${who} already approved`);
    c.approvals.push({ by: who, human: true, t: new Date().toISOString() });
    L.log(s, who, 'human', 'approved as a human', c.id);
  },
  halt(s, b) { L.find(s, b.id).halted = true; L.log(s, b.who || 'human', 'human', 'HALTED the ramp', b.id); },
  resume(s, b) { L.find(s, b.id).halted = false; L.log(s, b.who || 'human', 'human', 'resumed the ramp', b.id); },
  revert(s, b) { L.find(s, b.id).reverted = { t: new Date().toISOString(), reason: b.reason || 'reverted from GUI' }; L.log(s, b.who || 'human', 'human', 'REVERTED', b.id); },
  decision(s, b) {
    const d = s.decisions.find((d) => d.id === b.id);
    if (!L.LEVELS.includes(b.level)) throw new Error('bad level');
    d.level = b.level; L.log(s, b.who || 'human', 'human', `mapped "${d.name}" → ${b.level}`);
  },
  floor(s, b) { s.floor[b.key] = !!b.value; L.log(s, b.who || 'human', 'human', `floor ${b.key}: ${b.value ? 'yes' : 'no'}`); },
};

const clients = new Set();
let last = '';
function broadcast() {
  const data = JSON.stringify(view());
  if (data === last) return;
  last = data;
  for (const res of clients) res.write(`data: ${data}\n\n`);
}
fs.watchFile(L.FILE, { interval: 250 }, broadcast);

http.createServer((req, res) => {
  if (req.url === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(view())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  } else if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(view()));
  } else if (req.url === '/api/human' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      try {
        const b = JSON.parse(body), s = L.load();
        if (!HUMAN[b.action]) throw new Error('unknown action');
        HUMAN[b.action](s, b);
        L.save(s);
        broadcast();
        res.writeHead(200).end('{}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(fs.readFileSync(PAGE));
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Lifecycle board: http://localhost:${PORT}  (state: ${L.FILE})`));
