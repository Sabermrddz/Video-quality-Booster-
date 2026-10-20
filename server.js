const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const store = require('./jobs');
const b2 = require('./b2');
const gpu = require('./gpu');

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
    }
  } catch {}
}

loadEnv();

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const WORKER_SECRET = process.env.WORKER_SECRET || '';
const LOCAL_MODE = !b2.configured;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

store.startSweeper();

app.use('/api/worker', gpu.touch);
app.use('/api', gpu.router(requireWorkerSecret));

function requireWorkerSecret(req, res, next) {
  if (!WORKER_SECRET) return res.status(503).json({ error: 'WORKER_SECRET is not configured on the server' });
  if (req.get('x-worker-secret') !== WORKER_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function rejectIfTooLarge(req, res, next) {
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_FILE_BYTES) return res.status(413).json({ error: 'File too large (max 50 MB)' });
  next();
}

async function inputGetUrl(job) {
  return b2.configured ? b2.presignGet(job.inputKey) : `/api/files/${job.id}/input`;
}

async function outputPutUrl(job) {
  return b2.configured ? b2.presignPut(job.outputKey) : `/api/files/${job.id}/output`;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    error: job.error,
    processingSeconds: job.processingSeconds,
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: b2.configured ? 'b2' : 'local', jobs: store.stats() });
});

app.get('/api/config', (req, res) => {
  res.json({
    maxUploadMb: 50,
    maxDurationS: Number(process.env.MAX_DURATION_S) || 30,
    scale: Number(process.env.SCALE) || 4,
  });
});

app.post('/api/jobs', async (req, res, next) => {
  try {
    const id = crypto.randomUUID();
    const job = store.create(id);
    // Always use server upload endpoint to avoid CORS issues with B2
    const uploadUrl = `/api/jobs/${id}/upload-direct`;
    res.status(201).json({ jobId: id, uploadUrl, mode: 'server' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/jobs/:id/start', (req, res) => {
  const result = store.start(req.params.id);
  if (!result.ok) {
    const code = result.reason === 'not_found' ? 404 : 409;
    return res.status(code).json({ error: result.reason });
  }
  res.json({ ok: true, job: publicJob(result.job) });
});

app.get('/api/jobs/:id', async (req, res) => {
  const job = store.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  const out = publicJob(job);
  if (job.status === 'done') {
    // Use presigned URLs for video playback (works in <video> tags without CORS)
    // Only fetch/download needs the proxy
    if (b2.configured) {
      out.inputUrl = await b2.presignGet(job.inputKey);
      out.outputUrl = await b2.presignGet(job.outputKey);
    } else {
      out.inputUrl = `/api/jobs/${job.id}/input`;
      out.outputUrl = `/api/jobs/${job.id}/output`;
    }
  }
  res.json(out);
});

app.post('/api/jobs/:id/upload', rejectIfTooLarge, upload.single('file'), async (req, res, next) => {
  try {
    const job = store.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (job.status !== 'created') return res.status(409).json({ error: `status_is_${job.status}` });
    if (!req.file) return res.status(400).json({ error: 'missing file field' });
    if (b2.configured) {
      await b2.putObject(job.inputKey, req.file.buffer, req.file.mimetype || 'video/mp4');
    } else {
      job.inputBuffer = req.file.buffer;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.put('/api/jobs/:id/upload-direct', rejectIfTooLarge, express.raw({ limit: MAX_FILE_BYTES, type: () => true }), async (req, res, next) => {
  try {
    const job = store.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (job.status !== 'created') return res.status(409).json({ error: `status_is_${job.status}` });
    if (!req.body || req.body.length === 0) return res.status(400).json({ error: 'empty body' });
    
    if (b2.configured) {
      // Upload to B2 from server side (no CORS issues)
      await b2.putObject(job.inputKey, req.body, 'video/mp4');
    } else {
      job.inputBuffer = Buffer.from(req.body);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get('/api/jobs/:id/input', async (req, res, next) => {
  try {
    const job = store.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    
    if (b2.configured) {
      // Redirect to presigned URL for video playback
      const url = await b2.presignGet(job.inputKey);
      return res.redirect(url);
    } else {
      if (!job.inputBuffer) return res.status(409).json({ error: 'input not uploaded yet' });
      sendBuffer(req, res, job.inputBuffer);
    }
  } catch (err) {
    next(err);
  }
});

app.get('/api/jobs/:id/output', async (req, res, next) => {
  try {
    const job = store.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (job.status !== 'done') return res.status(409).json({ error: `status_is_${job.status}` });
    
    if (b2.configured) {
      // For downloads, redirect to presigned URL with response-content-disposition
      const cmd = new (require('@aws-sdk/client-s3').GetObjectCommand)({
        Bucket: process.env.B2_BUCKET,
        Key: job.outputKey,
        ResponseContentDisposition: `attachment; filename="enhanced-${job.id.slice(0, 8)}.mp4"`,
      });
      const downloadUrl = await require('@aws-sdk/s3-request-presigner').getSignedUrl(
        b2.s3,
        cmd,
        { expiresIn: 1200 }
      );
      return res.redirect(downloadUrl);
    } else {
      if (!job.outputBuffer) return res.status(409).json({ error: 'output not ready' });
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="enhanced-${job.id.slice(0, 8)}.mp4"`);
      sendBuffer(req, res, job.outputBuffer);
    }
  } catch (err) {
    next(err);
  }
});

app.get('/api/files/:id/input', (req, res) => {
  if (!LOCAL_MODE) return res.status(404).json({ error: 'not_available' });
  const job = store.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  if (!job.inputBuffer) return res.status(409).json({ error: 'input not uploaded yet' });
  sendBuffer(req, res, job.inputBuffer);
});

app.put('/api/files/:id/input', rejectIfTooLarge, express.raw({ limit: MAX_FILE_BYTES, type: () => true }), (req, res) => {
  if (!LOCAL_MODE) return res.status(404).json({ error: 'not_available' });
  const job = store.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  if (job.status !== 'created') return res.status(409).json({ error: `status_is_${job.status}` });
  if (!req.body || req.body.length === 0) return res.status(400).json({ error: 'empty body' });
  job.inputBuffer = Buffer.from(req.body);
  res.json({ ok: true });
});

app.put('/api/files/:id/output', rejectIfTooLarge, express.raw({ limit: MAX_FILE_BYTES, type: () => true }), (req, res) => {
  if (!LOCAL_MODE) return res.status(404).json({ error: 'not_available' });
  const job = store.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'not_found' });
  if (job.status !== 'processing') return res.status(409).json({ error: `status_is_${job.status}` });
  if (WORKER_SECRET && req.get('x-worker-secret') !== WORKER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!req.body || req.body.length === 0) return res.status(400).json({ error: 'empty body' });
  job.outputBuffer = Buffer.from(req.body);
  res.json({ ok: true });
});

app.get('/api/worker/next', requireWorkerSecret, async (req, res, next) => {
  try {
    const job = store.claimNext();
    if (!job) return res.json({ job: null });
    res.json({
      job: {
        jobId: job.id,
        inputUrl: await inputGetUrl(job),
        outputUrl: await outputPutUrl(job),
      },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/worker/:id/done', requireWorkerSecret, (req, res) => {
  const job = store.markDone(req.params.id, req.body && req.body.processingSeconds);
  if (!job) return res.status(409).json({ error: 'job not claimable' });
  res.json({ ok: true, job: publicJob(job) });
});

app.post('/api/worker/:id/failed', requireWorkerSecret, (req, res) => {
  const job = store.markFailed(req.params.id, req.body && req.body.message);
  if (!job) return res.status(409).json({ error: 'job not claimable' });
  res.json({ ok: true, job: publicJob(job) });
});

function sendBuffer(req, res, buf) {
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'no-store');
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] === '' ? null : parseInt(m[1], 10);
      let end = m[2] === '' ? null : parseInt(m[2], 10);
      if (start === null) {
        start = buf.length - (end || 0);
        end = buf.length - 1;
      } else if (end === null || end >= buf.length) {
        end = buf.length - 1;
      }
      if (start >= buf.length || start > end) {
        res.setHeader('Content-Range', `bytes */${buf.length}`);
        return res.status(416).end();
      }
      res.setHeader('Content-Range', `bytes ${start}-${end}/${buf.length}`);
      res.setHeader('Content-Length', end - start + 1);
      return res.status(206).end(buf.subarray(start, end + 1));
    }
  }
  res.setHeader('Content-Length', buf.length);
  res.status(200).end(buf);
}

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(code).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`GAN Video Enhancer listening on http://localhost:${PORT} (storage: ${b2.configured ? 'Backblaze B2' : 'local dev mode'})`);
});
