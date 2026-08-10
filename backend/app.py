"""WirelessAI Copilot backend for Dara Ron's GitHub Pages website.

The public browser NEVER receives OLLAMA_API_KEY. This service proxies chat
requests to Ollama Cloud using the same API pattern as the user's forecasting
code: https://ollama.com/api/chat + Bearer authentication.
"""

from __future__ import annotations

import os
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

OLLAMA_API_BASE = os.getenv("OLLAMA_API_BASE", "https://ollama.com/api").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gpt-oss:20b").strip()
OLLAMA_API_KEY = os.getenv("OLLAMA_API_KEY", "").strip()
REQUEST_TIMEOUT_SECONDS = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "180"))

# Comma-separated, for example:
# ALLOWED_ORIGINS=https://dron-cloud.github.io,http://localhost:8000,http://127.0.0.1:5500
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://dron-cloud.github.io,http://localhost:8000,http://127.0.0.1:5500",
    ).split(",")
    if origin.strip()
]

SYSTEM_PROMPT = """You are WirelessAI Copilot, a technical assistant for wireless systems.
Your audience includes beginners, students, researchers, and practicing engineers.

Core domains:
- 3GPP 5G NR and 5G-Advanced: PHY/MAC/RLC/PDCP/RRC, mobility, handover, slicing, KPMs.
- O-RAN: O-RU, O-DU, O-CU, Near-RT RIC, Non-RT RIC, xApps, rApps, E2, A1, O1, O2, Open Fronthaul.
- ITU/IMT concepts and requirements.
- NTN, LEO satellites, HAPS, Doppler, propagation, link budgets, routing, mobility, and handover.
- Wireless PHY: OFDM, MIMO, beamforming, SINR, CQI, BLER, MCS, interference, capacity.
- AI for wireless networks: forecasting, anomaly detection, reinforcement learning, AI-RAN, orchestration.

Answer clearly and technically. Start with the direct answer, then explain the intuition.
Use equations when they materially help. Distinguish standards-defined facts from engineering interpretation.
Do NOT invent a 3GPP, ITU, or O-RAN specification number, clause, release, quotation, or requirement.
If an exact standards citation is not present in supplied retrieval context, say that the exact clause should be
verified against the relevant official specification. Do not claim that model-memory-only answers are RAG-grounded.
Keep most answers concise unless the user asks for depth.
"""


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=10)


app = FastAPI(title="WirelessAI Copilot API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.get("/")
async def root() -> dict:
    return {"service": "WirelessAI Copilot", "status": "ok", "model": OLLAMA_MODEL}


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok" if OLLAMA_API_KEY else "missing_api_key",
        "model": OLLAMA_MODEL,
        "ollama_api_base": OLLAMA_API_BASE,
    }


@app.post("/api/chat")
async def chat(request: ChatRequest) -> dict:
    if not OLLAMA_API_KEY:
        raise HTTPException(status_code=500, detail="OLLAMA_API_KEY is not configured on the server.")

    # The last user message is already represented by request.message. Remove a
    # duplicate terminal user entry sent by the browser before forwarding.
    history = [m.model_dump() for m in request.history]
    if history and history[-1]["role"] == "user" and history[-1]["content"].strip() == request.message.strip():
        history.pop()

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history[-8:],
        {"role": "user", "content": request.message.strip()},
    ]

    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "think": "low" if OLLAMA_MODEL.lower().startswith("gpt-oss") else False,
        "options": {
            "temperature": 0.1,
            "num_predict": 1800,
        },
    }

    headers = {
        "Authorization": f"Bearer {OLLAMA_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(f"{OLLAMA_API_BASE}/chat", headers=headers, json=payload)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Ollama Cloud: {exc}") from exc

    if response.status_code >= 400:
        # Avoid exposing credentials; Ollama response text is safe to truncate.
        raise HTTPException(
            status_code=502,
            detail=f"Ollama Cloud returned HTTP {response.status_code}: {response.text[:800]}",
        )

    try:
        result = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Ollama Cloud returned non-JSON data.") from exc

    message = result.get("message") if isinstance(result, dict) else None
    answer = message.get("content", "").strip() if isinstance(message, dict) else ""
    if not answer:
        raise HTTPException(status_code=502, detail="Ollama Cloud returned no final message content.")

    return {
        "answer": answer,
        "model": OLLAMA_MODEL,
        "provider": "Ollama Cloud",
        "rag_grounded": False,
    }
