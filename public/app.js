(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    topbar: $("topbar"),
    apiDot: $("apiDot"),
    apiLabel: $("apiLabel"),
    menuBtn: $("menuBtn"),
    mobileMenu: $("mobileMenu"),
    autoplayToggle: $("autoplayToggle"),
    newsForm: $("newsForm"),
    panelUpload: $("panelUpload"),
    panelProgress: $("panelProgress"),
    panelResult: $("panelResult"),
    dropzone: $("dropzone"),
    fileInput: $("fileInput"),
    fileChip: $("fileChip"),
    fcPreview: $("fcPreview"),
    fcName: $("fcName"),
    fcSub: $("fcSub"),
    fcDuration: $("fcDuration"),
    fcRemove: $("fcRemove"),
    checkType: $("check-type"),
    checkDuration: $("check-duration"),
    checkSize: $("check-size"),
    checkDurationVal: $("checkDurationVal"),
    checkSizeVal: $("checkSizeVal"),
    enhanceBtn: $("enhanceBtn"),
    progressTitle: $("progressTitle"),
    jobIdText: $("jobIdText"),
    cancelBtn: $("cancelBtn"),
    timeline: $("timeline"),
    ring: $("ring"),
    ringProg: $("ringProg"),
    ringValue: $("ringValue"),
    ringLabel: $("ringLabel"),
    statusText: $("statusText"),
    elapsed: $("elapsed"),
    storageChip: $("storageChip"),
    logBody: $("logBody"),
    termLive: $("termLive"),
    workerOffline: $("workerOffline"),
    failedAlert: $("failedAlert"),
    failedMsg: $("failedMsg"),
    failedActions: $("failedActions"),
    retryBtn: $("retryBtn"),
    backBtn: $("backBtn"),
    compare: $("compare"),
    handle: $("handle"),
    videoBefore: $("videoBefore"),
    videoAfter: $("videoAfter"),
    playBtn: $("playBtn"),
    scrub: $("scrub"),
    timeCur: $("timeCur"),
    timeDur: $("timeDur"),
    downloadBtn: $("downloadBtn"),
    againBtn: $("againBtn"),
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
  const RING_C = 439.8;

  const state = {
    phase: "idle",
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
    autoplay: true,
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
    while (els.logBody.children.length > 80) els.logBody.firstElementChild.remove();
    els.logBody.scrollTop = els.logBody.scrollHeight;
  }

  function clearLogs() {
    els.logBody.textContent = "";
  }

  async function checkHealth() {
    try {
      const r = await fetch("/api/health");
      if (!r.ok) throw new Error("bad status");
      const data = await r.json();
      state.storage = data.storage;
      els.apiDot.className = "pill-dot ok";
      els.apiLabel.textContent = data.storage === "b2" ? "API online · B2 storage" : "API online · local mode";
    } catch {
      state.storage = "offline";
      els.apiDot.className = "pill-dot bad";
      els.apiLabel.textContent = "API offline";
    }
  }

  function showPanel(name) {
    els.panelUpload.classList.toggle("hidden", name !== "upload");
    els.panelProgress.classList.toggle("hidden", name !== "progress");
    els.panelResult.classList.toggle("hidden", name !== "result");
  }

  function setRing(pct, label, mode) {
    els.ring.classList.toggle("indeterminate", mode === "spin");
    els.ring.classList.toggle("fail", mode === "fail");
    if (mode === "spin") {
      els.ringValue.textContent = "…";
    } else {
      const p = Math.min(100, Math.max(0, Math.round(pct)));
      els.ringValue.textContent = p + "%";
      els.ringProg.style.strokeDashoffset = String(RING_C * (1 - p / 100));
    }
    if (label) els.ringLabel.textContent = label;
  }

  function setTimeline(phase) {
    els.timeline.querySelectorAll(".tl-item").forEach((li) => {
      const n = Number(li.dataset.phase);
      li.classList.toggle("done", n < phase || (phase === 4 && n === phase));
      li.classList.toggle("active", n === phase && phase < 4);
    });
    const p = phase <= 1 ? 0 : ((phase - 1) / 3) * 100;
    els.timeline.style.setProperty("--tl-p", p + "%");
  }

  function resetUI(keepFile) {
    stopTimers();
    state.phase = "idle";
    state.jobId = null;
    state.resultUrls = null;
    state.processingSeconds = null;
    state.warnedWorker = false;
    state.procPct = 0;
    state.framesDone = 0;
    state.lastQueueLog = 0;
    els.workerOffline.classList.add("hidden");
    els.failedAlert.classList.add("hidden");
    els.failedActions.classList.add("hidden");
    els.ring.classList.remove("indeterminate", "fail");
    els.ringProg.style.strokeDashoffset = String(RING_C);
    setRing(0, "idle");
    setTimeline(0);
    els.elapsed.textContent = "0:00 elapsed";
    els.playBtn.classList.remove("playing");
    els.termLive.style.opacity = "1";

    if (!keepFile) {
      if (state.fileUrl) {
        URL.revokeObjectURL(state.fileUrl);
        state.fileUrl = null;
      }
      state.file = null;
      state.duration = null;
      els.fileInput.value = "";
      els.fileChip.classList.add("hidden");
      els.fcPreview.removeAttribute("src");
      els.fcPreview.load();
      els.dropzone.classList.remove("hidden");
      els.checkType.className = "check";
      els.checkDuration.className = "check";
      els.checkSize.className = "check";
      els.checkDurationVal.textContent = "";
      els.checkSizeVal.textContent = "";
      els.enhanceBtn.disabled = true;
      clearLogs();
    }
    showPanel("upload");
  }

  function startTick() {
    state.phaseStart = Date.now();
    if (state.tickTimer) clearInterval(state.tickTimer);
    state.tickTimer = setInterval(() => {
      const s = Math.floor((Date.now() - state.phaseStart) / 1000);
      els.elapsed.textContent = fmtTime(s) + " elapsed";
      if (state.phase === "queued" && !state.warnedWorker && Date.now() - state.queuedAt > WORKER_WARN_MS) {
        state.warnedWorker = true;
        els.workerOffline.classList.remove("hidden");
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

  function setCheck(el, ok) {
    el.classList.toggle("pass", ok === true);
    el.classList.toggle("fail", ok === false);
  }

  function handleFile(file) {
    if (!file) return;
    if (file.size > LIMIT_SIZE) {
      setCheck(els.checkType, false);
      setCheck(els.checkSize, false);
      toast("error", `File is ${fmtBytes(file.size)} — the limit is 50 MB.`);
      return;
    }
    const okType = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
    if (!okType) {
      setCheck(els.checkType, false);
      toast("error", "That doesn't look like a video file.");
      return;
    }
    if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
    state.file = file;
    state.fileUrl = URL.createObjectURL(file);
    els.fcPreview.src = state.fileUrl;
    els.fcName.textContent = file.name;
    els.fcName.title = file.name;
    els.fcSub.textContent = fmtBytes(file.size);
    els.fcDuration.textContent = "--:--";
    els.checkSizeVal.textContent = fmtBytes(file.size);
    setCheck(els.checkSize, true);
    setCheck(els.checkType, true);
    els.dropzone.classList.add("hidden");
    els.fileChip.classList.remove("hidden");
    els.enhanceBtn.disabled = true;
    els.checkDuration.className = "check";
    els.checkDurationVal.textContent = "checking…";

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
        els.fcDuration.textContent = fmtTime(d);
        els.checkDurationVal.textContent = fmtTime(d) + " / 0:10";
        const ok = d <= LIMIT_DURATION_S + 0.05;
        setCheck(els.checkDuration, ok);
        if (!ok) toast("error", "Clip is longer than 10 seconds — trim it first.");
        els.enhanceBtn.disabled = !ok;
      } else {
        state.duration = null;
        els.checkDurationVal.textContent = "unknown";
        setCheck(els.checkDuration, false);
        toast("error", "Couldn't read the clip duration in this browser.");
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
    setRing(state.procPct, "gpu");
    if (state.frameTimer) clearInterval(state.frameTimer);
    state.frameTimer = setInterval(() => {
      if (state.phase !== "processing") return;
      const inc = 2 + Math.random() * 4;
      state.procPct = Math.min(92, state.procPct + (92 - state.procPct) * 0.09 + inc * 0.4);
      state.framesDone = Math.min(
        state.framesTotal - 1,
        Math.round((state.procPct / 100) * state.framesTotal)
      );
      const fps = (5.5 + Math.random() * 3).toFixed(1);
      setRing(state.procPct, "gpu");
      pushLog(`frame ${state.framesDone}/${state.framesTotal} · ${fps} fps`, "info");
    }, 1600);
  }

  async function beginEnhance() {
    if (!state.file || state.phase !== "idle") return;
    state.phase = "uploading";
    showPanel("progress");
    clearLogs();
    els.progressTitle.textContent = "Uploading your clip";
    els.jobIdText.textContent = "creating…";
    els.storageChip.textContent = "storage: " + state.storage;
    els.statusText.textContent = "Preparing upload…";
    setTimeline(1);
    setRing(0, "upload");
    startTick();
    pushLog("POST /api/jobs → creating job…", "info");

    try {
      const created = await fetch("/api/jobs", { method: "POST" });
      if (!created.ok) throw new Error(`Could not create job (${created.status})`);
      const { jobId, uploadUrl, mode } = await created.json();
      state.jobId = jobId;
      els.jobIdText.textContent = jobId.slice(0, 8) + "…";
      pushLog(`job ${jobId.slice(0, 8)}… created · mode=${mode}`, "ok");
      pushLog(`PUT ${uploadUrl.slice(0, 72)}${uploadUrl.length > 72 ? "…" : ""}`, "dim");

      let lastMilestone = -1;
      await xhrUpload(uploadUrl, state.file, (p) => {
        const pct = Math.round(p * 100);
        setRing(pct, "upload");
        els.statusText.textContent = `Uploading… ${pct}%`;
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
      els.statusText.textContent = "Queuing job…";
      setRing(100, "upload");
      const started = await fetch(`/api/jobs/${jobId}/start`, { method: "POST" });
      if (!started.ok) throw new Error(`Could not queue job (${started.status})`);
      pushLog("POST /api/jobs/:id/start → queued", "ok");

      state.phase = "queued";
      state.queuedAt = Date.now();
      state.lastQueueLog = Date.now();
      state.warnedWorker = false;
      els.workerOffline.classList.add("hidden");
      els.progressTitle.textContent = "In the queue";
      els.statusText.textContent = "Waiting for a GPU worker…";
      setRing(0, "queue", "spin");
      setTimeline(2);
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
        state.phase = "processing";
        els.workerOffline.classList.add("hidden");
        els.progressTitle.textContent = "Enhancing on the GPU";
        els.statusText.textContent = "Running Real-ESRGAN ×4…";
        setTimeline(3);
        pushLog("worker claimed job (x-worker-secret ok)", "ok");
        pushLog("ffprobe → duration within limit", "info");
        pushLog("downloading input → enhancing every frame…", "info");
        pushLog("model: realesr-general-x4v3 · scale 4", "dim");
        if (state.duration) state.framesTotal = Math.round(state.duration * 30);
        startFrameSim();
      }

      if (job.status === "done") {
        state.phase = "done";
        state.processingSeconds = job.processingSeconds;
        state.resultUrls = { input: job.inputUrl, output: job.outputUrl };
        stopTimers();
        setRing(100, "done");
        setTimeline(4);
        pushLog("output uploaded to storage", "ok");
        pushLog(`POST /api/worker/:id/done (${fmtSeconds(state.processingSeconds)})`, "ok");
        els.statusText.textContent = "Ready — loading comparison…";
        els.termLive.style.opacity = "0.4";
        setTimeout(showResult, 650);
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
    state.phase = "failed";
    els.progressTitle.textContent = "Something went wrong";
    els.statusText.textContent = "Failed";
    setRing(0, "failed", "fail");
    setTimeline(0);
    els.failedMsg.textContent = message;
    els.failedAlert.classList.remove("hidden");
    els.failedActions.classList.remove("hidden");
    els.termLive.style.opacity = "0.4";
  }

  async function showResult() {
    showPanel("result");
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
      if (state.autoplay) playVideos();
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
      els.timeCur.textContent = fmtTime(els.videoBefore.currentTime);
      const d = els.videoBefore.duration;
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
      if (state.autoplay) {
        playVideos();
      } else {
        els.playBtn.classList.remove("playing");
      }
    };
    els.videoBefore.src = state.resultUrls.input;
    els.videoAfter.src = state.resultUrls.output;
    els.videoBefore.load();
    els.videoAfter.load();
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
    const p = Math.min(100, Math.max(0, pct));
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
      }
    });
  }

  async function downloadResult() {
    if (!state.resultUrls) return;
    const btn = els.downloadBtn;
    btn.classList.add("busy");
    const orig = btn.innerHTML;
    btn.innerHTML =
      '<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-9-9"/></svg> Preparing…';
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
      btn.classList.remove("busy");
      btn.innerHTML = orig;
    }
  }

  function initHeader() {
    const onScroll = () => els.topbar.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function initFaq() {
    document.querySelectorAll(".faq-q").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".faq-item");
        const open = item.classList.toggle("open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  function initMenu() {
    els.menuBtn.addEventListener("click", () => {
      const open = els.mobileMenu.classList.toggle("hidden");
      els.menuBtn.setAttribute("aria-expanded", open ? "false" : "true");
    });
    els.mobileMenu.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        els.mobileMenu.classList.add("hidden");
        els.menuBtn.setAttribute("aria-expanded", "false");
      })
    );
  }

  function bindEvents() {
    els.dropzone.addEventListener("click", () => els.fileInput.click());
    els.dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); els.fileInput.click(); }
    });
    els.fileInput.addEventListener("change", () => handleFile(els.fileInput.files[0]));
    els.fcRemove.addEventListener("click", () => resetUI(false));

    ["dragenter", "dragover"].forEach((ev) =>
      els.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dropzone.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      els.dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dropzone.classList.remove("dragover");
      })
    );
    els.dropzone.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleFile(f);
    });
    document.addEventListener("dragover", (e) => e.preventDefault());
    document.addEventListener("drop", (e) => e.preventDefault());

    els.enhanceBtn.addEventListener("click", beginEnhance);
    els.retryBtn.addEventListener("click", () => {
      resetUI(true);
      setTimeout(beginEnhance, 250);
    });
    els.backBtn.addEventListener("click", () => resetUI(false));
    els.cancelBtn.addEventListener("click", () => resetUI(false));
    els.againBtn.addEventListener("click", () => resetUI(false));
    els.downloadBtn.addEventListener("click", downloadResult);

    els.autoplayToggle.addEventListener("change", () => {
      state.autoplay = els.autoplayToggle.checked;
      if (!state.autoplay && !els.videoBefore.paused) {
        els.videoBefore.pause();
        els.videoAfter.pause();
        els.playBtn.classList.remove("playing");
      }
    });

    els.newsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      toast("success", "Thanks — you're on the list for release notes.");
      els.newsForm.reset();
    });

    initCompare();
    initHeader();
    initFaq();
    initMenu();
  }

  bindEvents();
  checkHealth();
})();
