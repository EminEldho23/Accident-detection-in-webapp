/* ═══════════════════════════════════════════════════
   TRAFCON360 — Dashboard JS
   Connects to detection backend via WebSocket + REST
   ═══════════════════════════════════════════════════ */

const DASH_WS = `ws://${location.host}/ws/dashboard`;

// ── DOM refs ────────────────────────────────────────
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const alertBanner = $("#alertBanner");
const alertLane = $("#alertLane");
const alertConf = $("#alertConf");
const alertDismiss = $("#alertDismiss");
const accImg = $("#accidentImg");
const accDisplay = $("#accidentDisplay");
const noAccident = $("#noAccident");
const accStatus = $("#accStatus");
const accLane = $("#accLane");
const confBar = $("#confBar");
const confText = $("#confText");
const accTime = $("#accTime");
const accPlate = $("#accPlate");
const accOwner = $("#accOwner");
const accPhone = $("#accPhone");
const vehicleRow = $("#vehicleRow");
const ownerRow = $("#ownerRow");
const phoneRow = $("#phoneRow");

const backendBadge = $("#backendStatus");
const clock = $("#clock");
const accidentBadge = $("#accidentBadge");
const accidentLane = $("#accidentLane");
const historyGrid = $("#historyGrid");

// ── State ───────────────────────────────────────────
let lastAccidentLane = null;
let alertDismissedTime = 0;
let alertAudioCtx = null;
let accidentSeen = false;

// ── Clock ───────────────────────────────────────────
function tickClock() {
  clock.textContent = new Date().toLocaleTimeString();
}
setInterval(tickClock, 1000);
tickClock();

// ── Alert sound (Web Audio beep) ────────────────────
function playAlert() {
  try {
    if (!alertAudioCtx) alertAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = alertAudioCtx.createOscillator();
    const gain = alertAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(alertAudioCtx.destination);
    osc.frequency.setValueAtTime(880, alertAudioCtx.currentTime);
    osc.frequency.setValueAtTime(660, alertAudioCtx.currentTime + 0.12);
    osc.frequency.setValueAtTime(880, alertAudioCtx.currentTime + 0.24);
    gain.gain.setValueAtTime(0.25, alertAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, alertAudioCtx.currentTime + 0.5);
    osc.start(); osc.stop(alertAudioCtx.currentTime + 0.5);
  } catch (_) { }
}

// ── Dismiss alert ───────────────────────────────────
alertDismiss.addEventListener("click", () => {
  alertBanner.classList.add("hidden");
  alertDismissedTime = Date.now();
});

// ── Update signal lamps ─────────────────────────────
function updateSignals(signals) {
  for (let i = 1; i <= 4; i++) {
    const state = (signals[`lane${i}`] || "RED").toUpperCase();
    $(`#lamp${i}r`).classList.toggle("on", state === "RED");
    $(`#lamp${i}y`).classList.toggle("on", state === "YELLOW");
    $(`#lamp${i}g`).classList.toggle("on", state === "GREEN");
    $(`#sigState${i}`).textContent = state;
  }
}

// ── Update accident display ─────────────────────────
function updateAccident(accident) {
  if (!accident) return;

  if (accident.status) {
    const conf = Math.round((accident.confidence || 0) * 100);
    const lane = accident.lane_id || "?";

    // Show image
    if (accident.frame) {
      accImg.src = `data:image/jpeg;base64,${accident.frame}`;
      accImg.classList.remove("hidden");
      noAccident.classList.add("hidden");
      accDisplay.classList.add("active-border");
    }

    // Meta
    accStatus.textContent = "ACCIDENT";
    accStatus.className = "meta-value badge badge-alert";
    accLane.textContent = `Lane ${lane}`;
    confBar.style.width = `${conf}%`;
    confText.textContent = `${conf}%`;
    accTime.textContent = new Date().toLocaleTimeString();

    // Vehicle & Owner Info
    if (accident.plate) {
      accPlate.textContent = accident.plate;
      // Pulse effect when still scanning for plates
      if (accident.plate === "SCANNING...") {
        accPlate.classList.add("scanning");
      } else {
        accPlate.classList.remove("scanning");
      }
      vehicleRow.style.display = "flex";
    } else {
      vehicleRow.style.display = "none";
    }

    if (accident.owner_name) {
      accOwner.textContent = accident.owner_name + (accident.vehicle_model ? ` (${accident.vehicle_model})` : '');
      ownerRow.style.display = "flex";
    } else {
      ownerRow.style.display = "none";
    }

    if (accident.owner_phone) {
      accPhone.textContent = accident.owner_phone;
      phoneRow.style.display = "flex";
    } else {
      phoneRow.style.display = "none";
    }

    // ANPR Plate Preview
    const anprPreview = $("#anprPreview");
    if (anprPreview) {
      if (accident.plate_raw_crop || accident.plate_processed_crop) {
        anprPreview.classList.remove("hidden");
        const rawImg = $("#rawCropImg");
        const procImg = $("#procCropImg");
        if (rawImg && accident.plate_raw_crop)
          rawImg.src = `data:image/jpeg;base64,${accident.plate_raw_crop}`;
        if (procImg && accident.plate_processed_crop)
          procImg.src = `data:image/png;base64,${accident.plate_processed_crop}`;
        // Confidence badge
        const plateConf = accident.plate_confidence != null ? accident.plate_confidence : 0;
        const badge = $("#anprConfBadge");
        if (badge) {
          badge.textContent = `${Math.round(plateConf * 100)}%`;
          badge.className = plateConf < 0.60
            ? "anpr-conf-badge review"
            : "anpr-conf-badge ok";
        }
      } else {
        anprPreview.classList.add("hidden");
      }
    }



    // Alert banner (only if the lane changed or >10s since last dismiss)
    if (lane !== lastAccidentLane || Date.now() - alertDismissedTime > 10000) {
      alertBanner.classList.remove("hidden");
      alertLane.textContent = lane;
      alertConf.textContent = conf;
      playAlert();
    }
    lastAccidentLane = lane;
    accidentSeen = true;
  } else {
    // No accident — keep last image visible but update status
    if (accidentSeen) {
      accStatus.textContent = "Clear";
      accStatus.className = "meta-value badge badge-ok";
      accDisplay.classList.remove("active-border");

      vehicleRow.style.display = "none";
      ownerRow.style.display = "none";
      phoneRow.style.display = "none";

      const anprPreview = $("#anprPreview");
      if (anprPreview) anprPreview.classList.add("hidden");
    }
  }
}

// ── Update accident mode state ──────────────────────────
function updateAccidentMode(accidentMode) {
  if (accidentMode && accidentMode.is_active) {
    accidentBadge.classList.remove("hidden");
    accidentLane.textContent = accidentMode.priority_lane || "?";
  } else {
    accidentBadge.classList.add("hidden");
  }

  // Safety Sequence Banner
  const safetyBanner = $("#safetyBanner");
  const safetyPhaseText = $("#safetyPhaseText");
  if (safetyBanner && accidentMode && accidentMode.transition_phase) {
    safetyBanner.classList.remove("hidden");
    const phaseLabels = {
      "CAUTION": "⚠️ Stage 1 — YELLOW CAUTION (2s)",
      "HALT": "🛑 Stage 2 — ALL-RED SAFETY HALT (5s)",
      "RECOVERY": "✅ Stage 3 — RESUMING NORMAL MODE"
    };
    if (safetyPhaseText) {
      safetyPhaseText.textContent = phaseLabels[accidentMode.transition_phase] || accidentMode.transition_phase;
    }
  } else if (safetyBanner) {
    safetyBanner.classList.add("hidden");
  }
}

// ── MAPQ: Update Accident Queue Stack ──────────────────────────
function updateAccidentQueue(queue) {
  if (!queue || queue.length === 0) {
    if (mapqEmpty) mapqEmpty.style.display = "block";
    // Remove any existing queue items
    mapqStack.querySelectorAll(".mapq-item").forEach(el => el.remove());
    return;
  }

  if (mapqEmpty) mapqEmpty.style.display = "none";

  // Build the queue HTML
  const html = queue.map((item, idx) => {
    const statusClass = item.status === "RESPONDING" ? "mapq-responding" : "mapq-waiting";
    const statusIcon = item.status === "RESPONDING" ? "🟢" : "🔴";
    const elapsed = item.elapsed_seconds ? `${Math.round(item.elapsed_seconds)}s ago` : "just now";
    const conf = item.confidence ? `${Math.round(item.confidence * 100)}%` : "?";
    return `<div class="mapq-item ${statusClass}">
      <div class="mapq-item-info">
        <span class="mapq-lane">${statusIcon} Lane ${item.lane_id}</span>
        <span class="mapq-status-badge">${item.status}</span>
      </div>
      <div class="mapq-item-meta">
        <span>Conf: ${conf}</span>
        <span>${elapsed}</span>
        <button class="mapq-clear-btn" onclick="clearAccidentLane(${item.lane_id})" title="Clear this lane">✓ Clear</button>
      </div>
    </div>`;
  }).join("");

  // Only update if content changed (avoid flicker)
  const currentItems = mapqStack.querySelectorAll(".mapq-item");
  if (currentItems.length !== queue.length || mapqStack.innerHTML.indexOf(html) === -1) {
    // Keep mapqEmpty in place
    mapqStack.querySelectorAll(".mapq-item").forEach(el => el.remove());
    mapqStack.insertAdjacentHTML("beforeend", html);
  }
}

// ── MAPQ: Clear accident lane from dashboard ────────
async function clearAccidentLane(laneId) {
  try {
    const res = await fetch(`/api/accident/clear/${laneId}`, { method: "POST" });
    const data = await res.json();
    console.log(`MAPQ: Lane ${laneId} clear response:`, data);
  } catch (e) {
    console.warn("Failed to clear lane:", e);
  }
}
// Make globally accessible for onclick
window.clearAccidentLane = clearAccidentLane;

// ── WebSocket connection ────────────────────────────
let ws = null;
let wsRetry = 0;

function connectWS() {
  ws = new WebSocket(DASH_WS);

  ws.onopen = () => {
    wsRetry = 0;
    backendBadge.textContent = "Connected";
    backendBadge.className = "badge badge-on";
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.backend_connected) {
        backendBadge.textContent = "Backend Online";
        backendBadge.className = "badge badge-on";
      } else {
        backendBadge.textContent = "Backend Offline";
        backendBadge.className = "badge badge-off";
      }
      if (data.signals) updateSignals(data.signals);
      if (data.accident) updateAccident(data.accident);
      if (data.accident_mode) updateAccidentMode(data.accident_mode);
      if (data.accident_queue !== undefined) updateAccidentQueue(data.accident_queue);
      if (data.license_plates) updateLivePlates(data.license_plates);
    } catch (e) {
      console.warn("WS parse error:", e);
    }
  };

  ws.onclose = () => {
    backendBadge.textContent = "Disconnected";
    backendBadge.className = "badge badge-off";
    const delay = Math.min(1000 * Math.pow(2, wsRetry), 15000);
    wsRetry++;
    setTimeout(connectWS, delay);
  };

  ws.onerror = () => ws.close();
}
connectWS();

// ── Fallback: poll /api/accident if WS is down ─────
setInterval(async () => {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    const res = await fetch("/api/accident");
    const data = await res.json();
    updateAccident(data);
  } catch (_) { }
}, 2000);

// ── Detection history ───────────────────────────────
async function loadHistory() {
  try {
    const res = await fetch("/api/history?limit=60");
    const items = await res.json();
    if (!items.length) {
      historyGrid.innerHTML = '<p class="placeholder-text">No detections saved yet.</p>';
      return;
    }
    historyGrid.innerHTML = items.map((item) => `
      <div class="history-card" onclick="openLightbox('/api/history/image/${encodeURIComponent(item.filename)}')">
        <img src="/api/history/image/${encodeURIComponent(item.filename)}" loading="lazy" alt="Detection" />
        <div class="hc-info">
          <div class="hc-lane">Lane ${item.lane}</div>
          <div class="hc-time">${item.display_time}</div>
        </div>
      </div>
    `).join("");
  } catch (e) {
    historyGrid.innerHTML = '<p class="placeholder-text">Failed to load history.</p>';
  }
}

loadHistory();
setInterval(loadHistory, 15000);
$("#refreshHistory").addEventListener("click", loadHistory);

// ── Lightbox ────────────────────────────────────────
const lbHTML = `
<div id="lightbox">
  <button class="lb-close" onclick="closeLightbox()">✕</button>
  <img id="lbImg" src="" alt="Detection" />
</div>`;
document.body.insertAdjacentHTML("beforeend", lbHTML);

function openLightbox(src) {
  $("#lbImg").src = src;
  $("#lightbox").classList.add("open");
}
function closeLightbox() {
  $("#lightbox").classList.remove("open");
  $("#lbImg").src = "";
}
$("#lightbox").addEventListener("click", (e) => {
  if (e.target === $("#lightbox")) closeLightbox();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

/* ═══════════════════════════════════════════════════
   NUMBER PLATE DETECTION (ANPR) SECTION
   ═══════════════════════════════════════════════════ */

const platesBody = $("#platesBody");
const npdImageInput = $("#npd-image-input");
const npdVideoInput = $("#npd-video-input");
const npdImageResult = $("#npdImageResult");
const npdAnnotatedImg = $("#npdAnnotatedImg");
const npdCloseResult = $("#npdCloseResult");
const npdJobsSection = $("#npdJobsSection");
const npdJobsList = $("#npdJobsList");
const refreshPlatesBtn = $("#refreshPlates");

// ── Fetch all detected plates ───────────────────────
// ── Update live plates from WebSocket ────────────────
// Persistent client-side plate accumulator (survives between WS messages)
let accumulatedPlates = {};

function renderPlates() {
  const rows = Object.values(accumulatedPlates);
  if (rows.length === 0) {
    if (platesBody) platesBody.innerHTML = '<tr><td colspan="4" class="placeholder-text">No plates detected yet</td></tr>';
    return;
  }
  
  // Sort by timestamp descending (newest at top)
  rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  
  if (platesBody) {
    platesBody.innerHTML = rows.map(p => `
      <tr>
        <td><span class="plate-badge">${p.plate_text}</span></td>
        <td><span class="conf-badge">${Math.round((p.confidence || 0) * 100)}%</span></td>
        <td><span class="source-tag">${(p.source || '').replace('live_lane_', 'Lane ').replace('pre_accident_lane_', 'Lane ').replace('job_', 'Job ')}</span></td>
        <td>${p.car_id != null && p.car_id !== -1 ? '#' + p.car_id : '—'}</td>
      </tr>
    `).join("");
  }
}

function updateLivePlates(licensePlates) {
  if (!licensePlates || typeof licensePlates !== 'object') return;
  let hasNew = false;
  const now = Date.now();
  for (const [laneKey, detections] of Object.entries(licensePlates)) {
    if (!Array.isArray(detections)) continue;
    // Extract lane number from key like "lane1" → "1"
    const laneNum = laneKey.replace(/\D/g, '') || laneKey;
    for (const d of detections) {
      // Backend WS sends "plate" and "confidence" keys
      const plateText = d.plate || d.plate_text;
      const conf = d.confidence || d.text_score || d.plate_score || 0;
      if (plateText) {
        // Accumulate: keep highest confidence, but preserve newest timestamp at top
        if (!accumulatedPlates[plateText]) {
          accumulatedPlates[plateText] = {
            plate_text: plateText,
            confidence: conf,
            source: \`Lane ${laneNum}\`,
            car_id: d.car_id,
            timestamp: now
          };
          hasNew = true;
        } else if (conf > accumulatedPlates[plateText].confidence) {
          accumulatedPlates[plateText].confidence = conf;
          // Optionally update timestamp if you want to bump when confidence improves
          accumulatedPlates[plateText].timestamp = now;
          hasNew = true;
        }
      }
    }
  }
  if (hasNew) renderPlates();
}

async function loadPlates() {
  try {
    const res = await fetch("/api/number_plate/all_detected");
    const data = await res.json();
    const plates = data.plates || [];

    let hasNew = false;
    // Merge from backend source of truth
    plates.forEach(p => {
      const pt = p.plate_text;
      const ts = (p.timestamp || 0) * 1000; // backend sends seconds, JS uses ms
      if (!accumulatedPlates[pt] || p.confidence > accumulatedPlates[pt].confidence) {
        accumulatedPlates[pt] = {
          plate_text: pt,
          confidence: p.confidence,
          source: p.source,
          car_id: p.car_id,
          timestamp: ts || Date.now()
        };
        hasNew = true;
      }
    });
    
    if (hasNew || plates.length === 0) renderPlates();
  } catch (e) {
    console.warn("Failed to load plates:", e);
  }
}

// ── Fetch ANPR processing jobs ──────────────────────
async function loadJobs() {
  try {
    const res = await fetch("/api/number_plate/jobs");
    const data = await res.json();
    const jobs = data.jobs || {};
    const ids = Object.keys(jobs);

    if (ids.length === 0) {
      npdJobsSection.classList.add("hidden");
      return;
    }

    npdJobsSection.classList.remove("hidden");

    npdJobsList.innerHTML = ids.reverse().map(id => {
      const j = jobs[id];
      const statusCls = j.status === 'completed' ? 'completed'
        : j.status === 'error' ? 'error' : 'processing';
      const statusIcon = j.status === 'completed' ? '✅'
        : j.status === 'error' ? '❌' : '⏳';

      let progress = '';
      if (j.status === 'processing') {
        progress = `<div class="npd-progress-bar"><div class="npd-progress-fill" style="width:${j.progress || 0}%"></div></div>`;
      }

      let results = '';
      if (j.status === 'completed' && j.plates_found > 0) {
        results = `<div class="npd-job-results" id="job-results-${id}">
          <span class="source-tag">${j.plates_found} plate${j.plates_found !== 1 ? 's' : ''} found</span>
        </div>`;
      }

      return `<div class="npd-job-card">
        <div class="npd-job-info">
          <span class="npd-job-id">${statusIcon} Job ${id}</span>
          <span class="npd-job-file">${j.video || 'Unknown file'}</span>
        </div>
        <span class="npd-job-status ${statusCls}">${j.status} ${j.status === 'processing' ? (j.progress?.toFixed(0) || 0) + '%' : ''}</span>
        ${progress}
        ${results}
      </div>`;
    }).join("");

  } catch (e) {
    console.warn("Failed to load jobs:", e);
  }
}

// ── Image upload for plate detection ────────────────
if (npdImageInput) {
  npdImageInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/number_plate/detect_image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.annotated_image) {
        npdAnnotatedImg.src = `data:image/jpeg;base64,${data.annotated_image}`;
        npdImageResult.classList.remove("hidden");
      }

      // Refresh plates table to show new detections
      if (data.detections?.length > 0) {
        loadPlates();
      }
    } catch (err) {
      console.error("Image detection failed:", err);
    }
    // Reset input so same file can be uploaded again
    npdImageInput.value = "";
  });
}

// ── Video upload for plate detection ────────────────
if (npdVideoInput) {
  npdVideoInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/number_plate/upload_video?frame_skip=3", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      console.log("Video upload response:", data);
      // Jobs will auto-refresh
      loadJobs();
    } catch (err) {
      console.error("Video upload failed:", err);
    }
    npdVideoInput.value = "";
  });
}

// ── Close annotated image result ────────────────────
if (npdCloseResult) {
  npdCloseResult.addEventListener("click", () => {
    npdImageResult.classList.add("hidden");
    npdAnnotatedImg.src = "";
  });
}

// ── Refresh plates button ───────────────────────────
if (refreshPlatesBtn) {
  refreshPlatesBtn.addEventListener("click", () => {
    loadPlates();
    loadJobs();
  });
}

// ── Auto-refresh plates and jobs ────────────────────
loadPlates();
loadJobs();
setInterval(loadPlates, 5000);
setInterval(loadJobs, 3000);
