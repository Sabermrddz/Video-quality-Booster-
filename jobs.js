const PROCESSING_TIMEOUT_MS = Number(process.env.STALE_PROCESSING_MS) || 15 * 60 * 1000;
const JOB_TTL_MS = 2 * 60 * 60 * 1000;

const jobs = new Map();

function create(id) {
  const job = {
    id,
    status: 'created',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    queuedAt: null,
    processingAt: null,
    doneAt: null,
    inputKey: `in/${id}.mp4`,
    outputKey: `out/${id}.mp4`,
    inputBuffer: null,
    outputBuffer: null,
    error: null,
    processingSeconds: null,
    attempts: 0,
  };
  jobs.set(id, job);
  return job;
}

function get(id) {
  return jobs.get(id) || null;
}

function setStatus(job, status) {
  job.status = status;
  job.updatedAt = Date.now();
}

function start(id) {
  const job = jobs.get(id);
  if (!job) return { ok: false, reason: 'not_found' };
  if (job.status !== 'created') return { ok: false, reason: `status_is_${job.status}` };
  setStatus(job, 'queued');
  job.queuedAt = Date.now();
  return { ok: true, job };
}

function requeueStale() {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status === 'processing' && now - job.processingAt > PROCESSING_TIMEOUT_MS) {
      setStatus(job, 'queued');
      job.processingAt = null;
      job.queuedAt = now;
      job.attempts += 1;
    }
  }
}

function claimNext() {
  requeueStale();
  const active = [...jobs.values()].some((j) => j.status === 'processing');
  if (active) return null;
  const queued = [...jobs.values()]
    .filter((j) => j.status === 'queued')
    .sort((a, b) => a.createdAt - b.createdAt);
  if (queued.length === 0) return null;
  const job = queued[0];
  setStatus(job, 'processing');
  job.processingAt = Date.now();
  return job;
}

function markDone(id, processingSeconds) {
  const job = jobs.get(id);
  if (!job || job.status === 'done' || job.status === 'failed') return null;
  setStatus(job, 'done');
  job.doneAt = Date.now();
  if (typeof processingSeconds === 'number' && processingSeconds > 0) {
    job.processingSeconds = processingSeconds;
  } else if (job.processingAt) {
    job.processingSeconds = Math.round((job.doneAt - job.processingAt) / 100) / 10;
  }
  return job;
}

function markFailed(id, message) {
  const job = jobs.get(id);
  if (!job || job.status === 'done' || job.status === 'failed') return null;
  setStatus(job, 'failed');
  job.error = (message || 'Enhancement failed on the worker').slice(0, 500);
  return job;
}

function prune() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff && job.status !== 'processing') jobs.delete(id);
  }
}

function sweeper() {
  requeueStale();
  prune();
}

function startSweeper() {
  const t = setInterval(sweeper, 30 * 1000);
  t.unref();
}

function stats() {
  const counts = { created: 0, queued: 0, processing: 0, done: 0, failed: 0 };
  for (const job of jobs.values()) counts[job.status] += 1;
  return { total: jobs.size, ...counts };
}

module.exports = { create, get, start, claimNext, markDone, markFailed, startSweeper, stats };
