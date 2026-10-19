(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    gpuTestBtn: $("gpuTestBtn"),
    gpuBadge: $("gpuBadge"),
    gpuTestResult: $("gpuTestResult"),
    gpuQueueWarn: $("gpuQueueWarn"),
    paneUpload: $("paneUpload"),
    paneProc: $("paneProc"),
    paneResult: $("paneResult"),
    dz: $("dz"),
    fileInput: $("fileInput"),
    fileChip: $("fileChip"),
    fcName: $("fcName"),
    fcSub: $("fcSub"),
    fcRemove: $("fcRemove"),
    dzNotice: $("dzNotice"),
    enhanceBtn: $("enhanceBtn"),
    procFail: $("procFail"),
    procFailMsg: $("procFailMsg"),
    procSpin: $("procSpin"),
    procTitle: $("procTitle"),
    procSub: $("procSub"),
    procFill: $("procFill"),
    procPct: $("procPct"),
    stepUpload: $("stepUpload"),
    stepQueue: $("stepQueue"),
    stepGpu: $("stepGpu"),
    procWarn: $("procWarn"),
    termLive: $("termLive"),
    logBody: $("logBody"),
    compare: $("compare"),
    handle: $("handle"),
    videoBefore: $("videoBefore"),
    videoAfter: $("videoAfter"),
    playBtn: $("playBtn"),
    cmpTime: $("cmpTime"),
    timeCur: $("timeCur"),
    timeDur: $("timeDur"),
    scrub: $("scrub"),
    footUpload: $("footUpload"),
    footProc: $("footProc"),
    footDone: $("footDone"),
    footFail: $("footFail"),
    footFailMsg: $("footFailMsg"),
    cancelBtn: $("cancelBtn"),
    elapsed: $("elapsed"),
    retryBtn: $("retryBtn"),
    backBtn: $("backBtn"),
    againBtn: $("againBtn"),
    downloadBtn: $("downloadBtn"),
    resultStats: $("resultStats"),
    statTime: $("statTime"),
    statIn: $("statIn"),
    statOut: $("statOut"),
    statJob: $("statJob"),
    toasts: $("toasts"),
  };

  const LIMIT_DURATION_S = 10;
  const LIMIT_SIZE = 50 * 1024 * 1024;
  const POLL_MS = 3000;
  const WORKER_WARN_MS = 60000;

  const state = {
    phase: "idle", // idle | ready | uploading | queued | processing | done | failed
    file: null,
    fileUrl: null,
    duration: null,
    jobId: null,
    storage: "…",
    phaseStart: 0,
    queuedAt: 0,
    warnedWorker: false,
    resultUrls: null,
    processingSeconds: null,
    pollTimer: null,
    tickTimer: null,
    frameTimer: null,
    procPct: 0,
    framesDone: 0,
    framesTotal: 300,
    lastQueueLog: 0,
    gpuOnline: false,
    gpuBusy: false,
    gpuStatusTimer: null,
    gpuTestRunning: false,
  };

  function fmtBytes(n) {
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
    if (n >= 1024) return Math.round(n / 1024) + " KB";
    return n + " B";
  }

  function fmtTime(s) {
    if (!isFinite(s)) return "0:00";
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s / 60);
    return m + ":" + String(s % 60).padStart(2, "0");
  }

  function fmtSeconds(s) {
    if (s == null) return "—";
    if (s < 60) return s.toFixed(1) + " s";
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m} m ${r} s`;
  }

  function stamp() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");
  }

  function toast(kind, msg, ms = 4200) {
    const icons = {
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    };
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.innerHTML = (icons[kind] || icons.info) + "<span></span>";
    el.lastElementChild.textContent = msg;
    els.toasts.appendChild(el);
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => el.remove(), 260);
    }, ms);
  }

  function pushLog(msg, kind = "ok") {
    const ln = document.createElement("div");
    ln.className = "ln";
    ln.innerHTML = '<span class="t"></span><span class="m-' + kind + '"></span>';
    ln.firstElementChild.textContent = stamp();
    ln.lastElementChild.textContent = msg;
    els.logBody.appendChild(ln);
    while (els.logBody.children.length > 40) els.logBody.firstElementChild.remove();
  }

  function clearLogs() {
    els.logBody.textContent = "";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function gpuResult(msg) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    els.gpuTestResult.textContent = `Last test ${hh}:${mm}:${ss} - ${msg}`;
  }

  function updateGpuBadge() {
    if (!state.gpuOnline) {
      els.gpuBadge.className = "gpu-badge offline";
      els.gpuBadge.textContent = "offline";
    } else if (state.gpuBusy) {
      els.gpuBadge.className = "gpu-badge busy";
      els.gpuBadge.textContent = "busy";
    } else {
      els.gpuBadge.className = "gpu-badge online";
      els.gpuBadge.textContent = "online";
    }
    updateQueueWarning();
  }

  function updateQueueWarning() {
    const canEnhance = !!state.file && isFinite(state.duration) && state.duration <= LIMIT_DURATION_S + 0.05;
    const showWarn = canEnhance && !state.gpuOnline && (state.phase === "ready" || state.phase === "idle");
    els.gpuQueueWarn.classList.toggle("hidden", !showWarn);
    if (canEnhance) {
      els.enhanceBtn.disabled = false;
      els.enhanceBtn.classList.remove("hidden");
    }
  }

  async function refreshGpuStatus() {
    try {
      const r = await fetch("/api/gpu/status");
      if (!r.ok) throw new Error("bad status");
      const data = await r.json();
      state.gpuOnline = !!data.online;
      state.gpuBusy = !!data.busy;
    } catch {
      state.gpuOnline = false;
      state.gpuBusy = false;
    }
    updateGpuBadge();
  }

  async function runGpuConnectionTest() {
    if (state.gpuTestRunning) return;
    state.gpuTestRunning = true;
    els.gpuTestBtn.disabled = true;
    const oldText = els.gpuTestBtn.textContent;
    els.gpuTestBtn.textContent = "Testing...";
    els.gpuTestBtn.classList.add("testing");
    try {
      const started = await fetch("/api/gpu/ping", { method: "POST" });
      if (started.status === 429) {
        gpuResult("Wait a few seconds before testing again");
        return;
      }
      if (!started.ok) throw new Error("cannot_start_ping");
      const payload = await started.json();
      const pingId = payload && payload.pingId;
      if (!pingId) throw new Error("missing_ping_id");

      const begin = Date.now();
      while (Date.now() - begin <= 25000) {
        const r = await fetch(`/api/gpu/ping/${encodeURIComponent(pingId)}`);
        if (!r.ok) throw new Error("poll_failed");
        const data = await r.json();

        if (data.status === "ok") {
          if (data.state === "connected") {
            const gpu = data.gpu || {};
            const gb = Math.round((Number(gpu.vram_mb) || 0) / 1024);
            const secs = (Number(data.rttMs || 0) / 1000).toFixed(1);
            gpuResult(`GPU connected: ${gpu.name || "Unknown GPU"} (${gb} GB), model ${gpu.model || "unknown"}, response ${secs} s`);
          } else if (data.state === "busy") {
            gpuResult("GPU connected, currently processing a job");
          } else if (data.state === "no_gpu") {
            gpuResult("Worker is online but has no GPU: set the Kaggle accelerator to GPU");
          } else {
            gpuResult("Cannot reach the server");
          }
          return;
        }

        if (data.status === "timeout") {
          if (data.state === "offline") {
            gpuResult("GPU worker offline: start the Kaggle notebook");
          } else {
            const seen = Number(data.lastSeenSecondsAgo);
            const seenText = Number.isFinite(seen) ? seen : "unknown";
            gpuResult(`Worker seen ${seenText} s ago but did not answer: check the notebook output`);
          }
          return;
        }

        await sleep(1000);
      }
      gpuResult("Cannot reach the server");
    } catch {
      gpuResult("Cannot reach the server");
    } finally {
      els.gpuTestBtn.classList.remove("testing");
      els.gpuTestBtn.textContent = oldText;
      els.gpuTestBtn.disabled = false;
      state.gpuTestRunning = false;
      refreshGpuStatus();
    }
  }

  function setPhase(name) {
    state.phase = name;
    els.paneUpload.classList.toggle("hidden", name !== "idle" && name !== "ready");
    els.paneProc.classList.toggle("hidden", !["uploading", "queued", "processing", "failed"].includes(name));
    els.paneResult.classList.toggle("hidden", name !== "done");
    els.footUpload.classList.toggle("hidden", name !== "ready");
    els.footProc.classList.toggle("hidden", !["uploading", "queued", "processing"].includes(name));
    els.footDone.classList.toggle("hidden", name !== "done");
    els.footFail.classList.toggle("hidden", name !== "failed");
  }

  function notice(msg) {
    if (!msg) {
      els.dzNotice.classList.add("hidden");
      els.dzNotice.textContent = "";
    } else {
      els.dzNotice.textContent = msg;
      els.dzNotice.classList.remove("hidden");
    }
  }

  function setBar(pct, mode) {
    els.procFill.classList.toggle("indeterminate", mode === "spin");
    if (mode === "spin") {
      els.procPct.textContent = "…";
    } else {
      const p = Math.min(100, Math.max(0, Math.round(pct)));
      els.procFill.style.width = p + "%";
      els.procPct.textContent = p + "%";
    }
  }

  function setStep(active) {
    const order = [els.stepUpload, els.stepQueue, els.stepGpu];
    order.forEach((li, i) => {
      li.classList.toggle("done", i < active);
      li.classList.toggle("active", i === active);
    });
  }

  function resetUI() {
    stopTimers();
    setPhase("idle");
    state.jobId = null;
    state.resultUrls = null;
    state.processingSeconds = null;
    state.warnedWorker = false;
    state.procPct = 0;
    state.framesDone = 0;
    state.lastQueueLog = 0;
    if (state.fileUrl) {
      URL.revokeObjectURL(state.fileUrl);
      state.fileUrl = null;
    }
    state.file = null;
    state.duration = null;
    els.fileInput.value = "";
    els.fileChip.classList.add("hidden");
    els.enhanceBtn.classList.add("hidden");
    els.dz.classList.remove("dragover");
    notice("");
    els.procWarn.classList.add("hidden");
    els.procFail.classList.add("hidden");
    els.procFill.classList.remove("indeterminate");
    els.procFill.style.width = "0%";
    els.procPct.textContent = "0%";
    setStep(0);
    els.elapsed.textContent = "0:00 elapsed";
    els.playBtn.classList.remove("playing");
    els.termLive.style.opacity = "1";
    els.scrub.value = 0;
    els.scrub.style.setProperty("--fill", "0%");
    els.timeCur.textContent = "0:00";
    els.timeDur.textContent = "0:00";
    els.resultStats.classList.add("hidden");
    clearLogs();
    updateQueueWarning();
  }

  function startTick() {
    state.phaseStart = Date.now();
    if (state.tickTimer) clearInterval(state.tickTimer);
    state.tickTimer = setInterval(() => {
      const s = Math.floor((Date.now() - state.phaseStart) / 1000);
      els.elapsed.textContent = fmtTime(s) + " elapsed";
      if (state.phase === "queued" && !state.warnedWorker && Date.now() - state.queuedAt > WORKER_WARN_MS) {
        state.warnedWorker = true;
        els.procWarn.classList.remove("hidden");
        pushLog("worker idle 60s — is the Kaggle notebook running?", "warn");
      }
      if (state.phase === "queued" && Date.now() - state.lastQueueLog > 15000) {
        state.lastQueueLog = Date.now();
        pushLog(`poll → still queued (${Math.round((Date.now() - state.queuedAt) / 1000)}s)`, "dim");
      }
    }, 1000);
  }

  function stopTimers() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
    if (state.frameTimer) { clearInterval(state.frameTimer); state.frameTimer = null; }
  }

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("video/") && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
      notice("Please select a video file.");
      toast("error", "That doesn't look like a video file.");
      return;
    }
    if (file.size > LIMIT_SIZE) {
      notice(`This file is ${fmtBytes(file.size)} — the limit is 50 MB.`);
      toast("error", "File too large — 50 MB max.");
      return;
    }
    state.file = file;
    state.fileUrl = URL.createObjectURL(file);
    els.fcName.textContent = file.name;
    els.fcName.title = file.name;
    els.fcSub.textContent = fmtBytes(file.size);
    els.fileChip.classList.remove("hidden");
    notice("");
    els.enhanceBtn.disabled = true;
    els.enhanceBtn.classList.add("hidden");
    setPhase("idle");

    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.muted = true;
    probe.src = state.fileUrl;
    probe.onloadedmetadata = () => {
      const d = probe.duration;
      if (!isFinite(d)) {
        probe.currentTime = 1e7;
        probe.ontimeupdate = () => {
          probe.ontimeupdate = null;
          finishDuration(probe.duration);
        };
      } else {
        finishDuration(d);
      }
    };
    probe.onerror = () => finishDuration(NaN);

    function finishDuration(d) {
      if (isFinite(d) && d > 0) {
        state.duration = d;
        if (d > LIMIT_DURATION_S + 0.05) {
          notice("This clip is over 10 seconds. Pick a shorter one.");
          toast("error", "Clip is longer than 10 seconds — trim it first.");
          els.gpuQueueWarn.classList.add("hidden");
        } else {
          notice("");
          state.phase = "ready";
          els.enhanceBtn.disabled = false;
          els.enhanceBtn.classList.remove("hidden");
          updateQueueWarning();
        }
      } else {
        state.duration = null;
        notice("Couldn't read the clip duration in this browser.");
        toast("error", "Couldn't read the clip duration in this browser.");
        els.gpuQueueWarn.classList.add("hidden");
      }
    }
  }

  function xhrUpload(url, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(file);
    });
  }

  async function fallbackUpload(jobId, file) {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const r = await fetch(`/api/jobs/${jobId}/upload`, { method: "POST", body: fd });
    if (!r.ok) throw new Error(`Fallback upload failed (${r.status})`);
  }

  function startFrameSim() {
    state.framesDone = 0;
    state.procPct = 8;
    setBar(state.procPct);
    if (state.frameTimer) clearInterval(state.frameTimer);
    state.frameTimer = setInterval(() => {
      if (state.phase !== "processing") return;
      state.procPct = Math.min(92, state.procPct + (92 - state.procPct) * 0.09 + (1 + Math.random() * 2));
      state.framesDone = Math.min(
        state.framesTotal - 1,
        Math.round((state.procPct / 100) * state.framesTotal)
      );
      setBar(state.procPct);
      pushLog(`frame ${state.framesDone}/${state.framesTotal} · ${(5.5 + Math.random() * 3).toFixed(1)} fps`, "info");
    }, 1600);
  }

  async function beginEnhance() {
    if (!state.file || (state.phase !== "idle" && state.phase !== "ready")) return;
    setPhase("uploading");
    clearLogs();
    els.procTitle.textContent = "Uploading your clip";
    els.procSub.textContent = "Straight to private storage";
    els.procWarn.classList.add("hidden");
    setStep(0);
    setBar(0);
    startTick();
    pushLog("POST /api/jobs → creating job…", "info");

    try {
      const created = await fetch("/api/jobs", { method: "POST" });
      if (!created.ok) throw new Error(`Could not create job (${created.status})`);
      const { jobId, uploadUrl, mode } = await created.json();
      state.jobId = jobId;
      pushLog(`job ${jobId.slice(0, 8)}… created · mode=${mode}`, "ok");

      let lastMilestone = -1;
      await xhrUpload(uploadUrl, state.file, (p) => {
        const pct = Math.round(p * 100);
        setBar(pct);
        const milestone = Math.floor(pct / 25);
        if (milestone > lastMilestone && milestone > 0) {
          lastMilestone = milestone;
          pushLog(`upload ${milestone * 25}% (${fmtBytes(state.file.size * p)} / ${fmtBytes(state.file.size)})`, "info");
        }
      }).catch(async (upErr) => {
        if (mode === "b2") {
          pushLog("direct PUT blocked (CORS?) — falling back to server upload", "warn");
          toast("info", "Direct upload blocked — retrying through the server…");
          await fallbackUpload(jobId, state.file);
        } else {
          throw upErr;
        }
      });

      pushLog(`upload complete (${fmtBytes(state.file.size)})`, "ok");
      setBar(100);
      const started = await fetch(`/api/jobs/${jobId}/start`, { method: "POST" });
      if (!started.ok) throw new Error(`Could not queue job (${started.status})`);
      pushLog("POST /api/jobs/:id/start → queued", "ok");

      setPhase("queued");
      state.queuedAt = Date.now();
      state.lastQueueLog = Date.now();
      state.warnedWorker = false;
      els.procWarn.classList.add("hidden");
      els.procTitle.textContent = "Giving your clip a lift";
      els.procSub.textContent = "Waiting for a free GPU worker";
      setBar(0, "spin");
      setStep(1);
      startTick();
      startPolling();
    } catch (err) {
      failFlow(err.message || "Upload failed");
    }
  }

  function startPolling() {
    pollOnce();
    state.pollTimer = setInterval(pollOnce, POLL_MS);
  }

  async function pollOnce() {
    if (!state.jobId) return;
    try {
      const r = await fetch(`/api/jobs/${state.jobId}`);
      if (r.status === 404) {
        failFlow("The job was lost (server restarted). Please try again.");
        return;
      }
      if (!r.ok) return;
      const job = await r.json();

      if (job.status === "processing" && state.phase !== "processing") {
        setPhase("processing");
        els.procWarn.classList.add("hidden");
        els.procTitle.textContent = "Enhancing with Real-ESRGAN";
        els.procSub.textContent = "Every frame, ×4 — a few minutes";
        setStep(2);
        pushLog("worker claimed job", "ok");
        pushLog("model: realesr-general-x4v3 · scale 4", "dim");
        if (state.duration) state.framesTotal = Math.max(1, Math.round(state.duration * 30));
        startFrameSim();
      }

      if (job.status === "done") {
        setPhase("done");
        state.processingSeconds = job.processingSeconds;
        state.resultUrls = { input: job.inputUrl, output: job.outputUrl };
        stopTimers();
        setBar(100);
        setStep(3);
        pushLog("output uploaded to storage", "ok");
        pushLog(`done in ${fmtSeconds(state.processingSeconds)}`, "ok");
        els.termLive.style.opacity = "0.35";
        setTimeout(showResult, 500);
      }

      if (job.status === "failed") {
        pushLog(`job failed: ${job.error || "unknown"}`, "error");
        failFlow(job.error || "The worker reported a failure.");
      }
    } catch {
      // transient network hiccup — keep polling
    }
  }

  function failFlow(message) {
    stopTimers();
    setPhase("failed");
    els.procTitle.textContent = "Something went wrong";
    els.procSub.textContent = "The job did not finish";
    els.procFailMsg.textContent = message;
    els.procFail.classList.remove("hidden");
    els.procSpin.style.display = "none";
    els.footFailMsg.textContent = message;
    els.termLive.style.opacity = "0.35";
    setBar(0);
    setStep(0);
  }

  async function showResult() {
    setPhase("done");
    els.statTime.textContent = fmtSeconds(state.processingSeconds);
    els.statIn.textContent = "loading…";
    els.statOut.textContent = "loading…";
    els.statJob.textContent = (state.jobId || "—").slice(0, 8);
    els.timeCur.textContent = "0:00";
    els.timeDur.textContent = "0:00";
    els.scrub.value = 0;
    els.scrub.style.setProperty("--fill", "0%");
    setSliderPos(50);
    els.compare.classList.add("loading");

    const hideSkeleton = () => els.compare.classList.remove("loading");
    const fallback = setTimeout(hideSkeleton, 9000);

    els.videoBefore.onloadedmetadata = () => {
      clearTimeout(fallback);
      hideSkeleton();
      els.timeDur.textContent = fmtTime(els.videoBefore.duration);
      els.statIn.textContent = `${els.videoBefore.videoWidth}×${els.videoBefore.videoHeight} · ${fmtTime(els.videoBefore.duration)}`;
      playVideos();
    };
    els.videoAfter.onloadedmetadata = () => {
      els.statOut.textContent = `${els.videoAfter.videoWidth}×${els.videoAfter.videoHeight}`;
    };
    els.videoBefore.onerror = () => {
      clearTimeout(fallback);
      hideSkeleton();
      toast("error", "Couldn't load the original video.");
    };
    els.videoAfter.onerror = () => {
      clearTimeout(fallback);
      hideSkeleton();
      toast("error", "Couldn't load the enhanced video.");
    };
    els.videoBefore.ontimeupdate = () => {
      const d = els.videoBefore.duration;
      els.timeCur.textContent = fmtTime(els.videoBefore.currentTime);
      els.cmpTime.textContent = fmtTime(els.videoBefore.currentTime);
      if (d) {
        const pct = (els.videoBefore.currentTime / d) * 100;
        els.scrub.value = Math.round(pct * 10);
        els.scrub.style.setProperty("--fill", pct + "%");
      }
      if (els.videoBefore.paused && !els.videoAfter.paused) {
        els.videoAfter.pause();
      } else if (!els.videoBefore.paused && els.videoAfter.paused) {
        els.videoAfter.play().catch(() => {});
      }
      if (Math.abs(els.videoAfter.currentTime - els.videoBefore.currentTime) > 0.18) {
        els.videoAfter.currentTime = els.videoBefore.currentTime;
      }
    };
    els.videoBefore.onended = () => {
      els.videoBefore.currentTime = 0;
      els.videoAfter.currentTime = 0;
      playVideos();
    };
    els.videoBefore.src = state.resultUrls.input;
    els.videoAfter.src = state.resultUrls.output;
    els.videoBefore.load();
    els.videoAfter.load();
    els.resultStats.classList.remove("hidden");
  }

  function playVideos() {
    els.videoBefore.play().then(() => els.playBtn.classList.add("playing")).catch(() => {});
    els.videoAfter.play().catch(() => {});
  }

  function togglePlay() {
    if (els.videoBefore.paused) {
      playVideos();
    } else {
      els.videoBefore.pause();
      els.videoAfter.pause();
      els.playBtn.classList.remove("playing");
    }
  }

  function setSliderPos(pct) {
    const p = Math.min(98, Math.max(2, pct));
    els.compare.style.setProperty("--pos", p + "%");
    els.handle.style.left = p + "%";
    els.handle.setAttribute("aria-valuenow", Math.round(p));
  }

  function initCompare() {
    let dragging = false;
    const move = (clientX) => {
      const rect = els.compare.getBoundingClientRect();
      setSliderPos(((clientX - rect.left) / rect.width) * 100);
    };
    els.compare.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".playbtn")) return;
      dragging = true;
      els.compare.setPointerCapture(e.pointerId);
      move(e.clientX);
    });
    els.compare.addEventListener("pointermove", (e) => {
      if (dragging) move(e.clientX);
    });
    els.compare.addEventListener("pointerup", () => { dragging = false; });
    els.compare.addEventListener("pointercancel", () => { dragging = false; });

    els.handle.addEventListener("keydown", (e) => {
      const cur = parseFloat(els.handle.getAttribute("aria-valuenow")) || 50;
      if (e.key === "ArrowLeft") { setSliderPos(cur - 3); e.preventDefault(); }
      if (e.key === "ArrowRight") { setSliderPos(cur + 3); e.preventDefault(); }
    });

    els.playBtn.addEventListener("click", togglePlay);
    els.scrub.addEventListener("input", () => {
      const d = els.videoBefore.duration;
      const pct = (Number(els.scrub.value) / 1000) * 100;
      els.scrub.style.setProperty("--fill", pct + "%");
      if (d) {
        const t = (Number(els.scrub.value) / 1000) * d;
        els.videoBefore.currentTime = t;
        els.videoAfter.currentTime = t;
        els.timeCur.textContent = fmtTime(t);
        els.cmpTime.textContent = fmtTime(t);
      }
    });
  }

  async function downloadResult() {
    if (!state.resultUrls) return;
    const btn = els.downloadBtn;
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = "Preparing…";
    try {
      const r = await fetch(state.resultUrls.output);
      if (!r.ok) throw new Error(`Download failed (${r.status})`);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `enhanced-${(state.jobId || "clip").slice(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      toast("success", "Enhanced clip downloaded.");
    } catch (err) {
      toast("error", err.message || "Download failed.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  }

  function bindEvents() {
    els.dz.addEventListener("click", (e) => {
      if (e.target.closest("#fcRemove") || e.target.closest("#enhanceBtn")) return;
      els.fileInput.click();
    });
    els.dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
    });
    els.fileInput.addEventListener("change", () => handleFile(els.fileInput.files[0]));
    els.fcRemove.addEventListener("click", (e) => {
      e.stopPropagation();
      resetUI();
    });

    ["dragenter", "dragover"].forEach((ev) =>
      els.dz.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dz.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      els.dz.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dz.classList.remove("dragover");
      })
    );
    els.dz.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleFile(f);
    });
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => e.preventDefault());

    els.enhanceBtn.addEventListener("click", (e) => { e.stopPropagation(); beginEnhance(); });
    els.retryBtn.addEventListener("click", () => {
      resetUI();
      beginEnhance();
    });
    els.backBtn.addEventListener("click", resetUI);
    els.cancelBtn.addEventListener("click", resetUI);
    els.againBtn.addEventListener("click", resetUI);
    els.downloadBtn.addEventListener("click", downloadResult);
    els.gpuTestBtn.addEventListener("click", runGpuConnectionTest);

    initCompare();
  }

  bindEvents();
  refreshGpuStatus();
  state.gpuStatusTimer = setInterval(refreshGpuStatus, 10000);
})();
