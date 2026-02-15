"""
TRAFCON360 - Accident Detection Dashboard
Standalone dashboard server (port 5500) that connects to the detection backend (port 8000).
Shows real-time accident alerts, detected images, traffic signal states, and detection history.

Run:  python dashboard.py
Open: http://localhost:5500
"""

import asyncio
import json
import os
import glob
import base64
import time
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
import httpx
import uvicorn

# ── Configuration ──────────────────────────────────────────────────
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000")
BACKEND_WS  = os.environ.get("BACKEND_WS", "ws://localhost:8000/ws/emergency")
DASHBOARD_PORT = int(os.environ.get("DASHBOARD_PORT", "5500"))

# Where the detection backend saves annotated accident images
DETECTION_OUTPUT_DIR = os.environ.get(
    "DETECTION_OUTPUT_DIR",
    r"C:\Trafcon\Accident_detection_2\accident-detection-system\detection_output_result"
)

# ── App ────────────────────────────────────────────────────────────
app = FastAPI(title="TRAFCON360 Dashboard", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


# ── Accident history from saved images on disk ─────────────────────
def get_detection_history(limit: int = 100):
    """Read saved detection images from the output directory."""
    if not os.path.isdir(DETECTION_OUTPUT_DIR):
        return []

    files = sorted(
        glob.glob(os.path.join(DETECTION_OUTPUT_DIR, "*.jpg")),
        key=os.path.getmtime,
        reverse=True,
    )[:limit]

    history = []
    for fpath in files:
        fname = os.path.basename(fpath)
        mtime = os.path.getmtime(fpath)
        # Parse lane from filename: accident_lane3_20260205_142315_123.jpg
        lane = "?"
        parts = fname.replace(".jpg", "").split("_")
        for p in parts:
            if p.startswith("lane"):
                lane = p.replace("lane", "")
                break

        history.append({
            "filename": fname,
            "path": fpath,
            "lane": lane,
            "timestamp": datetime.fromtimestamp(mtime).isoformat(),
            "display_time": datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S"),
        })
    return history


# ── API routes ─────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "backend_url": BACKEND_URL,
    })


@app.get("/api/history")
async def detection_history(limit: int = 100):
    """Return list of saved detection images."""
    return get_detection_history(limit)


@app.get("/api/history/image/{filename}")
async def detection_image(filename: str):
    """Serve a saved detection image."""
    safe = os.path.basename(filename)
    fpath = os.path.join(DETECTION_OUTPUT_DIR, safe)
    if os.path.isfile(fpath):
        return FileResponse(fpath, media_type="image/jpeg")
    return JSONResponse({"error": "not found"}, status_code=404)


@app.get("/api/accident")
async def proxy_accident():
    """Proxy the backend /accident_api so dashboard JS doesn't need CORS."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{BACKEND_URL}/accident_api")
            return r.json()
    except Exception as e:
        return {"status": False, "frame": "", "lane_id": None, "confidence": 0, "error": str(e)}


@app.get("/api/status")
async def proxy_status():
    """Proxy backend /status."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{BACKEND_URL}/status")
            return r.json()
    except Exception as e:
        return {"error": str(e), "backend_reachable": False}


# ── Simulation control proxies ─────────────────────────────────────
@app.post("/api/upload/{lane_id}")
async def proxy_upload(lane_id: int, request: Request):
    """Proxy video upload to backend (forwards multipart body as-is)."""
    try:
        body = await request.body()
        content_type = request.headers.get("content-type", "")
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f"{BACKEND_URL}/upload/{lane_id}",
                content=body,
                headers={"content-type": content_type},
            )
            try:
                data = r.json()
            except Exception:
                data = {"status": "ok", "raw": r.text}
            return JSONResponse(data, status_code=r.status_code)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@app.post("/api/simulation/start")
async def proxy_simulation_start():
    """Proxy simulation start to backend."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{BACKEND_URL}/simulation/start")
            return r.json()
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/simulation/reset")
async def proxy_simulation_reset():
    """Proxy simulation reset to backend."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(f"{BACKEND_URL}/simulation/reset")
            return r.json()
    except Exception as e:
        return {"error": str(e)}


@app.post("/api/debug/trigger_accident")
async def proxy_debug_trigger(lane_id: int = 1):
    """Proxy debug accident trigger to backend."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.post(f"{BACKEND_URL}/debug/trigger_accident?lane_id={lane_id}")
            return r.json()
    except Exception as e:
        return {"error": str(e)}


# ── WebSocket relay ────────────────────────────────────────────────
@app.websocket("/ws/dashboard")
async def dashboard_ws(ws: WebSocket):
    """
    Relays data from the backend WebSocket (/ws/emergency) to the dashboard,
    enriched with accident_api data. Falls back to REST polling if WS is down.
    """
    await ws.accept()
    import websockets

    async def _fetch_accident():
        try:
            async with httpx.AsyncClient(timeout=1) as client:
                r = await client.get(f"{BACKEND_URL}/accident_api")
                return r.json()
        except Exception:
            return {"status": False, "frame": "", "lane_id": None, "confidence": 0}

    async def _fetch_signals():
        try:
            async with httpx.AsyncClient(timeout=1) as client:
                r = await client.get(f"{BACKEND_URL}/signals")
                return r.json()
        except Exception:
            return {"signals": {}, "emergency": {"is_active": False, "lane_id": None}}

    # Keep retrying: WS when available, REST fallback when not
    while True:
        # Try WebSocket relay
        try:
            async with websockets.connect(BACKEND_WS) as backend_ws:
                while True:
                    try:
                        raw = await asyncio.wait_for(backend_ws.recv(), timeout=2)
                        data = json.loads(raw)
                    except asyncio.TimeoutError:
                        data = None

                    accident = await _fetch_accident()

                    payload = {
                        "signals": data.get("signals", {}) if data else {},
                        "emergency": data.get("emergency", {}) if data else {},
                        "detections": data.get("detections", {}) if data else {},
                        "accident": accident,
                        "backend_connected": data is not None,
                        "timestamp": datetime.now().isoformat(),
                    }

                    await ws.send_text(json.dumps(payload))
                    await asyncio.sleep(0.3)

        except WebSocketDisconnect:
            return  # Client left — stop
        except Exception:
            pass  # Backend WS down — fall through to REST polling

        # REST fallback: poll /signals + /accident_api
        try:
            for _ in range(10):  # Try REST for ~10s then retry WS
                accident = await _fetch_accident()
                sig_data = await _fetch_signals()

                await ws.send_text(json.dumps({
                    "signals": sig_data.get("signals", {}),
                    "emergency": sig_data.get("emergency", {}),
                    "detections": {},
                    "accident": accident,
                    "backend_connected": bool(sig_data.get("signals")),
                    "timestamp": datetime.now().isoformat(),
                }))
                await asyncio.sleep(1)
        except WebSocketDisconnect:
            return


# ── Run ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"\n🚀 TRAFCON360 Dashboard starting on http://localhost:{DASHBOARD_PORT}")
    print(f"📡 Detection backend: {BACKEND_URL}")
    print(f"📁 Detection images:  {DETECTION_OUTPUT_DIR}\n")
    uvicorn.run("dashboard:app", host="0.0.0.0", port=DASHBOARD_PORT, reload=True)
