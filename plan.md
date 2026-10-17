# Prototype Plan: GAN Video Enhancer (Node.js + Heroku + B2 + Kaggle)

Goal: a website where a user uploads a clip (max 10 s), a free GPU worker enhances it (x4), and the page shows a before/after comparison. Cost: $0. GPU time needed: about 5 hours in total (testing + demo day).

> Honest scope: the model is a **pretrained** Real-ESRGAN (image-based GAN). Training our own temporal GAN stays future work, as in the report. The prototype demonstrates the pipeline and the user interface from Phase 4.

---

## 1. Architecture

```
Browser ──► Heroku (Node.js: site + job queue) ◄──► Kaggle GPU worker (Python)
   │                                                      │
   └───────────► Backblaze B2 (input/output videos) ◄─────┘
```

| Part | Role | Does NOT do |
|---|---|---|
| Heroku (Node/Express) | Serves the page, creates jobs, hands out presigned B2 URLs, tracks status | No AI, no video processing |
| Backblaze B2 | Stores original and enhanced videos | Nothing else |
| Kaggle notebook | Polls Heroku, downloads, enhances, uploads, reports back | Never holds B2 keys |

Key design choice: the worker receives **presigned URLs** from Heroku, so Kaggle only needs `HEROKU_URL` and `WORKER_SECRET`. B2 keys live only on Heroku.

## 2. Job flow

1. Browser asks `POST /api/jobs` and gets `{jobId, uploadUrl}`.
2. Browser uploads the file straight to B2 with `PUT uploadUrl`.
3. Browser calls `POST /api/jobs/:id/start` and the status becomes `queued`.
4. Worker polls `GET /api/worker/next` and claims the oldest queued job. It receives `inputUrl` (presigned GET) and `outputUrl` (presigned PUT).
5. Worker downloads, checks with ffprobe (duration <= 10 s), enhances, uploads the result to `outputUrl`, then calls `POST /api/worker/:id/done` (or `/failed` with a message).
6. Browser polls `GET /api/jobs/:id` every 3 s. On `done` it receives presigned GET URLs for both videos and shows the slider.

Statuses: `created -> queued -> processing -> done | failed`.

## 3. Repository structure

```
gan-video-enhancer/
├─ server.js            # Express app + API
├─ jobs.js              # in-memory job store
├─ b2.js                # S3 client + presigned URL helpers
├─ public/
│  ├─ index.html        # upload form, status, before/after slider
│  ├─ app.js
│  └─ style.css
├─ worker/
│  └─ worker.ipynb      # Kaggle notebook (Python)
├─ package.json         # "engines": {"node": "20.x"}
├─ Procfile             # web: node server.js
└─ .env.example
```

## 4. Step 1: Backblaze B2 setup

1. Create a **private** bucket (e.g. `gan-video-demo`).
2. Create an **Application Key** limited to this bucket (read + write). Save `keyID` and `applicationKey` (shown once).
3. Note the bucket's **S3 endpoint** (e.g. `https://s3.us-west-004.backblazeb2.com`) and region (`us-west-004`).
4. **CORS** (required so the browser can `PUT` directly). Allow origin = your Heroku URL (and `http://localhost:3000` for testing), methods `PUT, GET, HEAD`, headers `*`. B2's S3-compatible CORS rules may need the CLI or API instead of the web switch, so check the current B2 docs.
5. Optional lifecycle rule: delete files after 1 day.

**Fallback if CORS fights you:** let the browser upload to Heroku (`multer` in memory, 50 MB limit) and have Heroku `PutObject` to B2. A 10 s clip is small, so this works for a demo.

## 5. Step 2: Heroku backend (Node.js)

Dependencies: `express`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `nanoid`, `cors`.

`b2.js` (S3 client for B2):
```js
const { S3Client } = require('@aws-sdk/client-s3');
module.exports.s3 = new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APP_KEY,
  },
});
```

Endpoints:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/jobs` | none | Create job, return presigned PUT URL for `in/<id>.mp4` |
| POST | `/api/jobs/:id/start` | none | Mark `queued` |
| GET | `/api/jobs/:id` | none | Status; when done, presigned GET URLs |
| GET | `/api/worker/next` | `x-worker-secret` | Claim oldest queued job, return presigned input GET + output PUT |
| POST | `/api/worker/:id/done` | `x-worker-secret` | Mark done |
| POST | `/api/worker/:id/failed` | `x-worker-secret` | Mark failed + message |

Rules to implement:
- Presigned URLs expire in 15 to 30 minutes.
- Only one job `processing` at a time.
- If a job stays `processing` for more than 15 minutes, set it back to `queued` (worker crashed).
- Reject if `Content-Length` > 50 MB; client also checks duration <= 10 s through `video.duration`, and the worker rechecks with ffprobe.
- Jobs live in memory. They are lost when the dyno restarts or sleeps, which is fine for a demo.

Config vars (Heroku dashboard -> Settings):
`B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`, `B2_ENDPOINT`, `B2_REGION`, `WORKER_SECRET` (long random string).

Deploy:
```bash
heroku create gan-video-demo
heroku config:set B2_KEY_ID=... B2_APP_KEY=... B2_BUCKET=... B2_ENDPOINT=... B2_REGION=... WORKER_SECRET=...
git push heroku main
```

## 6. Step 3: Frontend (public/)

- File input (`accept="video/*"`), scale fixed to x4, "Enhance" button.
- Check `video.duration <= 10` and size <= 50 MB before uploading.
- Status line: Uploading, Waiting for GPU worker, Processing, Done. Show "worker offline" if a job stays `queued` for more than 60 s.
- On done: **before/after slider** (two stacked `<video>` elements synced, with a draggable clip-path divider), a download button, and the label **"AI-enhanced: not the original footage"** (Karim's persona).
- Show the measured processing time (Nadia's persona).

## 7. Step 4: Kaggle worker (`worker.ipynb`)

Notebook settings: **Accelerator = GPU (T4/P100)**, **Internet = On** (needs phone verification). Store `HEROKU_URL` and `WORKER_SECRET` in Kaggle **Secrets** (Add-ons -> Secrets), never in the notebook text.

Setup cell (run once per session):
```bash
!git clone https://github.com/xinntao/Real-ESRGAN.git
%cd Real-ESRGAN
!pip install basicsr facexlib gfpgan realesrgan
!pip install -r requirements.txt
!python setup.py develop
```

Known issue: `basicsr` may fail with `No module named 'torchvision.transforms.functional_tensor'`. Fix by editing `basicsr/data/degradations.py` and changing that import to `from torchvision.transforms.functional import rgb_to_grayscale`.

Worker loop (Python, `requests` + `subprocess`):
1. `GET {HEROKU_URL}/api/worker/next` with header `x-worker-secret`. If empty, sleep 5 s and repeat.
2. Download `inputUrl` to `in.mp4`.
3. `ffprobe` -> reject if duration > 10.5 s (`/failed`).
4. Run the repo's video script, which uses ffmpeg internally:
   ```bash
   python inference_realesrgan_video.py -n realesr-general-x4v3 -i in.mp4 -o out_dir -s 4 --suffix out
   ```
   (Check the repo README for current model names and options. Weights download automatically.)
5. `PUT` the output file to `outputUrl`, then `POST /api/worker/:id/done`.
6. On any exception, `POST /api/worker/:id/failed` with the error text.
7. Log the processing time for every job (needed for the Test slide).

Tip: use input around 360p or 480p. A 10 s, 30 fps clip is about 300 frames, and x4 on a free GPU usually takes a few minutes (measure it).

Optional stretch: add RealBasicVSR as a second model (temporal baseline) only if the first run goes well.

## 8. Time plan (5 GPU hours)

| Block | Time | What |
|---|---|---|
| Build, no GPU | before | Backend, frontend, deploy to Heroku, B2 CORS tested with a dummy worker |
| Session 1 | 3 h | Install worker, fix errors, run 3 to 5 clips, record processing times, screenshot everything |
| Backup | 0.5 h | Save one original + enhanced clip locally (offline demo fallback) |
| Demo day | 1.5 h | Start worker 30 to 45 min early, open the site to wake the dyno, run one test clip |

Never leave Kaggle idle with the GPU on; stop the session when you finish.

## 9. Test checklist (feeds the Test slide)

- [ ] Upload, queue, process, slider works end to end
- [ ] 11 s clip and 60 MB file are rejected
- [ ] Worker killed mid-job: job returns to `queued` after the timeout
- [ ] Wrong `x-worker-secret` returns 401
- [ ] Record: input resolution, output resolution, duration, processing time, GPU model
- [ ] Compare against bicubic (ffmpeg `scale=iw*4:ih*4:flags=bicubic`) visually; note any flicker

## 10. Demo-day checklist

- [ ] Heroku site opened 5 min before (dyno awake)
- [ ] Kaggle worker running and showing "waiting for jobs"
- [ ] B2 CORS and keys valid; test upload done
- [ ] Backup: pre-made original/enhanced pair + screenshots/screen recording
- [ ] Say clearly: pretrained Real-ESRGAN; our temporal GAN is the designed next step
- [ ] Wi-Fi/hotspot ready

## 11. Risks

| Risk | Mitigation |
|---|---|
| Kaggle GPU or internet unavailable | Colab as second worker (same code), plus the offline backup |
| Heroku dyno asleep | Open the site early |
| B2 CORS errors | Fallback: upload through Heroku |
| Slow processing | Lower input resolution, shorter clip |
| Hallucinated details | Slider + "AI-enhanced" label + keep original |
