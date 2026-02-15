/* ═══════════════════════════════════════════════════
   TRAFCON360 — Dashboard JS
   Connects to detection backend via WebSocket + REST
   ═══════════════════════════════════════════════════ */

const DASH_WS = `ws://${location.host}/ws/dashboard`;

// ── DOM refs ────────────────────────────────────────
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const alertBanner   = $("#alertBanner");
const alertLane     = $("#alertLane");
const alertConf     = $("#alertConf");
const alertDismiss  = $("#alertDismiss");
const accImg        = $("#accidentImg");
const accDisplay    = $("#accidentDisplay");
const noAccident    = $("#noAccident");
const accStatus     = $("#accStatus");
const accLane       = $("#accLane");
const confBar       = $("#confBar");
const confText      = $("#confText");
const accTime       = $("#accTime");
const backendBadge  = $("#backendStatus");
const clock         = $("#clock");
const emerBadge     = $("#emergencyBadge");
const emerLane      = $("#emergencyLane");
const historyGrid   = $("#historyGrid");

// ── State ───────────────────────────────────────────
let lastAccidentLane   = null;
let alertDismissedTime = 0;
let alertAudioCtx      = null;
let accidentSeen       = false;

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
    const osc  = alertAudioCtx.createOscillator();
    const gain = alertAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(alertAudioCtx.destination);
    osc.frequency.setValueAtTime(880, alertAudioCtx.currentTime);
    osc.frequency.setValueAtTime(660, alertAudioCtx.currentTime + 0.12);
    osc.frequency.setValueAtTime(880, alertAudioCtx.currentTime + 0.24);
    gain.gain.setValueAtTime(0.25, alertAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, alertAudioCtx.currentTime + 0.5);
    osc.start(); osc.stop(alertAudioCtx.currentTime + 0.5);
  } catch (_) {}
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
    }
  }
}

// ── Update emergency state ──────────────────────────
function updateEmergency(emergency) {
  if (emergency && emergency.is_active) {
    emerBadge.classList.remove("hidden");
    emerLane.textContent = emergency.lane_id || "?";
  } else {
    emerBadge.classList.add("hidden");
  }
}

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
      if (data.emergency) updateEmergency(data.emergency);
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
  } catch (_) {}
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
