const express = require('express');
const crypto = require('crypto');

const num = (k, d) => Number(process.env[k]) || d;
const ONLINE_TTL_MS = num('WORKER_ONLINE_TTL_S', 20) * 1000;
const PING_TIMEOUT_MS = num('PING_TIMEOUT_S', 20) * 1000;
const PING_RATE_MS = num('PING_RATE_LIMIT_S', 5) * 1000;

const worker = { lastSeen: 0, busy: false, jobId: null, gpu: null };
const pings = new Map();
let lastPingCreatedAt = 0;

function secretOk(req) {
  const s = process.env.WORKER_SECRET || '';
  return s !== '' && req.get('x-worker-secret') === s;
}
function touch(req, res, next) {
  if (secretOk(req)) worker.lastSeen = Date.now();
  next();
}
function isOnline() {
  return worker.lastSeen > 0 && Date.now() - worker.lastSeen < ONLINE_TTL_MS;
}
function ago() {
  return worker.lastSeen ? Math.round((Date.now() - worker.lastSeen) / 1000) : null;
}
function pendingPing() {
  const now = Date.now();
  for (const p of pings.values()) {
    if (!p.answeredAt && now - p.createdAt <= PING_TIMEOUT_MS) return p;
  }
  return null;
}

function router(requireWorkerSecret) {
  const r = express.Router();

  r.get('/gpu/status', (req, res) => {
    res.json({ online: isOnline(), busy: worker.busy, lastSeenSecondsAgo: ago(), gpu: worker.gpu });
  });

  r.post('/gpu/ping', (req, res) => {
    const now = Date.now();
    if (now - lastPingCreatedAt < PING_RATE_MS) {
      return res.status(429).json({ error: 'wait_a_few_seconds' });
    }
    const existing = pendingPing();
    if (existing) return res.json({ pingId: existing.id });
    for (const [id, p] of pings) if (now - p.createdAt > 5 * 60 * 1000) pings.delete(id);
    const p = { id: crypto.randomUUID(), createdAt: now, answeredAt: null, answer: null };
    pings.set(p.id, p);
    lastPingCreatedAt = now;
    res.status(201).json({ pingId: p.id });
  });

  r.get('/gpu/ping/:id', (req, res) => {
    const p = pings.get(req.params.id);
    if (!p) return res.status(404).json({ error: 'not_found' });
    const base = { lastSeenSecondsAgo: ago() };
    if (p.answeredAt) {
      const a = p.answer || {};
      const state = a.available === false ? 'no_gpu' : (a.busy ? 'busy' : 'connected');
      return res.json({
        ...base, status: 'ok', state,
        rttMs: p.answeredAt - p.createdAt,
        busy: !!a.busy,
        gpu: { available: a.available, name: a.name, vram_mb: a.vram_mb, model: a.model },
      });
    }
    if (Date.now() - p.createdAt > PING_TIMEOUT_MS) {
      return res.json({ ...base, status: 'timeout', state: isOnline() ? 'timeout' : 'offline' });
    }
    res.json({ ...base, status: 'pending', state: 'pending' });
  });

  r.post('/worker/heartbeat', requireWorkerSecret, (req, res) => {
    const b = req.body || {};
    worker.busy = !!b.busy;
    worker.jobId = b.jobId || null;
    const p = pendingPing();
    res.json({ pingId: p ? p.id : null });
  });

  r.post('/worker/ping/:id', requireWorkerSecret, (req, res) => {
    const p = pings.get(req.params.id);
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (!p.answeredAt) {
      p.answeredAt = Date.now();
      p.answer = req.body || {};
    }
    const a = p.answer;
    worker.gpu = { available: a.available, name: a.name, vram_mb: a.vram_mb, model: a.model };
    res.json({ ok: true });
  });

  return r;
}

module.exports = { touch, router };