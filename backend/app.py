from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# ============================================================
# Environment configuration
# ============================================================

OLLAMA_API_BASE = os.getenv(
    "OLLAMA_API_BASE",
    "https://ollama.com/api",
).rstrip("/")

OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL",
    "gpt-oss:20b",
).strip()

OLLAMA_API_KEY = os.getenv(
    "OLLAMA_API_KEY",
    "",
).strip()

REQUEST_TIMEOUT_SECONDS = float(
    os.getenv(
        "REQUEST_TIMEOUT_SECONDS",
        "180",
    )
)

OLLAMA_NUM_PREDICT = int(
    os.getenv(
        "OLLAMA_NUM_PREDICT",
        "-1",
    )
)

OLLAMA_THINKING = os.getenv(
    "OLLAMA_THINKING",
    "low",
).strip().lower()

if OLLAMA_THINKING not in {
    "low",
    "medium",
    "high",
}:
    OLLAMA_THINKING = "low"


# ============================================================
# Public-chat limits
# ============================================================

MAX_USER_CHARACTERS = int(
    os.getenv(
        "MAX_USER_CHARACTERS",
        "6000",
    )
)

MAX_HISTORY_MESSAGES = int(
    os.getenv(
        "MAX_HISTORY_MESSAGES",
        "8",
    )
)

MAX_HISTORY_CHARACTERS_PER_MESSAGE = int(
    os.getenv(
        "MAX_HISTORY_CHARACTERS_PER_MESSAGE",
        "4000",
    )
)

RATE_LIMIT_REQUESTS = int(
    os.getenv(
        "RATE_LIMIT_REQUESTS",
        "30",
    )
)

RATE_LIMIT_WINDOW_SECONDS = int(
    os.getenv(
        "RATE_LIMIT_WINDOW_SECONDS",
        "600",
    )
)


# ============================================================
# CORS
# ============================================================

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        (
            "https://dron-cloud.github.io,"
            "http://localhost:8000,"
            "http://127.0.0.1:5500,"
            "http://localhost:5500"
        ),
    ).split(",")
    if origin.strip()
]


# ============================================================
# General-purpose system prompt
# ============================================================

SYSTEM_PROMPT = """
You are AI Chat, a general-purpose AI assistant hosted on
Dr. Dara Ron's research website and powered by an external
large language model.

You can help users with:

- General knowledge
- Science and engineering
- Mathematics
- Programming and debugging
- Artificial intelligence and machine learning
- Writing and editing
- Research and technical concepts
- Education and learning
- Brainstorming
- Everyday questions and problem solving

Guidelines:

1. Answer the user's question directly.
2. Explain difficult concepts clearly.
3. Adapt the technical depth to the user's apparent expertise.
4. Use examples when useful.
5. Use equations, code, or tables when they materially improve the answer.
6. Never fabricate sources, citations, quotations, references, or factual details.
7. If you are uncertain, say what is uncertain.
8. Clearly distinguish established facts from assumptions or interpretation.
9. Do not imply that you searched the web or consulted external sources unless
   retrieval context was actually provided to you.
10. Do not claim access to real-time information unless such information is
    explicitly supplied in the conversation.
11. Keep answers concise by default but provide more detail when requested.
12. For technical questions, prioritize correctness over confidence.
13. Do not claim that you are the underlying foundation model itself.

You are a conversational assistant for general-purpose use.
""".strip()


KHMER_LANGUAGE_INSTRUCTIONS = """
The user has explicitly selected Khmer mode.

LANGUAGE REQUIREMENT:
- Your response MUST be primarily in Khmer (ភាសាខ្មែរ).
- Do not answer primarily in English.
- Do not switch to English just because the topic is technical.
- Section headings should normally be in Khmer.
- Explanatory sentences should be written in natural, readable Khmer.

TECHNICAL TERMINOLOGY:
- Use Khmer-first explanations.
- Keep important English technical terms in parentheses when useful.
- Preserve established acronyms, standards names, protocol names, software names,
  programming languages, equations, model names, and technical identifiers.
- Examples:
  - បញ្ញាសិប្បនិម្មិត (Artificial Intelligence)
  - ការរៀនម៉ាស៊ីន (Machine Learning)
  - បណ្តាញសរសៃប្រសាទ (Neural Network)
  - គំរូភាសាខ្នាតធំ (Large Language Model: LLM)
  - បណ្តាញឥតខ្សែ (Wireless Network)
  - ផ្កាយរណបគន្លងទាប (Low-Earth-Orbit Satellite: LEO)
- Preserve terms such as AI, LLM, GPU, CPU, API, Python, 5G, 6G, O-RAN,
  AI-RAN, O-RU, O-DU, O-CU, Near-RT RIC, E2, A1, Wi-Fi, TCP/IP, HTTP,
  JSON, and SQL in their established form where appropriate.
- Do not force literal Khmer translations if they are awkward, uncommon,
  ambiguous, or technically inaccurate.
- If there is no clear Khmer technical term, explain the idea naturally in Khmer
  and retain the English technical term.

STYLE:
- For beginner questions, use simple Khmer.
- For advanced technical questions, keep precise English terminology alongside
  Khmer explanations.
- If the user mixes Khmer and English, respond naturally in Khmer while preserving
  useful English technical terminology.
- If the user explicitly asks for English, English is allowed.

ACCURACY:
- Never fabricate facts, citations, standards, references, clauses, or quotations.
- If uncertain about a Khmer translation, prefer the established English technical
  term with a clear Khmer explanation rather than inventing a translation.
""".strip()


# ============================================================
# Request models
# ============================================================

class HistoryMessage(BaseModel):
    role: Literal[
        "user",
        "assistant",
    ]

    content: str = Field(
        min_length=1,
        max_length=12000,
    )


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=MAX_USER_CHARACTERS)
    history: list[HistoryMessage] = Field(default_factory=list)
    language: Literal["en", "km"] = "en"


# ============================================================
# FastAPI
# ============================================================

app = FastAPI(
    title="AI Chat API",
    description=(
        "General-purpose bilingual English/Khmer AI chat "
        "interface backed by Ollama Cloud."
    ),
    version="5.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=[
        "GET",
        "POST",
        "OPTIONS",
    ],
    allow_headers=[
        "Content-Type",
    ],
)


# ============================================================
# Basic in-memory rate limiter
# ============================================================

request_log: dict[
    str,
    deque[float],
] = defaultdict(deque)


def get_client_ip(
    request: Request,
) -> str:
    forwarded = request.headers.get(
        "x-forwarded-for",
        "",
    )

    if forwarded:
        return forwarded.split(",")[0].strip()

    if request.client:
        return request.client.host

    return "unknown"


def enforce_rate_limit(
    request: Request,
) -> None:
    client_ip = get_client_ip(
        request
    )

    now = time.monotonic()

    timestamps = request_log[
        client_ip
    ]

    cutoff = (
        now
        - RATE_LIMIT_WINDOW_SECONDS
    )

    while (
        timestamps
        and timestamps[0] < cutoff
    ):
        timestamps.popleft()

    if (
        len(timestamps)
        >= RATE_LIMIT_REQUESTS
    ):
        raise HTTPException(
            status_code=429,
            detail=(
                "Too many requests. "
                "Please try again later."
            ),
        )

    timestamps.append(now)


# ============================================================
# Helpers
# ============================================================

def get_thinking_setting():
    if OLLAMA_MODEL.lower().startswith(
        "gpt-oss"
    ):
        return OLLAMA_THINKING

    return False


def build_system_prompt(
    language: str,
) -> str:
    if language == "km":
        return (
            SYSTEM_PROMPT
            + "\n\n"
            + KHMER_LANGUAGE_INSTRUCTIONS
        )

    return (
        SYSTEM_PROMPT
        + "\n\n"
        + (
            "Respond in clear, natural English unless the user "
            "explicitly asks for another language."
        )
    )


def prepare_user_message(
    message: str,
    language: str,
) -> str:
    if language != "km":
        return message

    return (
        "សូមឆ្លើយសំណួរខាងក្រោមជាភាសាខ្មែរ។ "
        "សូមពន្យល់ជាភាសាខ្មែរជាចម្បង ហើយរក្សាពាក្យបច្ចេកទេសសំខាន់ៗ "
        "ជាភាសាអង់គ្លេសក្នុងវង់ក្រចក នៅពេលវាជួយឱ្យអត្ថន័យច្បាស់។ "
        "កុំឆ្លើយជាភាសាអង់គ្លេសជាចម្បង។\n\n"
        + message
    )

def clean_history(
    history: list[HistoryMessage],
    current_message: str,
) -> list[dict[str, str]]:
    cleaned: list[
        dict[str, str]
    ] = []

    recent_history = history[
        -MAX_HISTORY_MESSAGES:
    ]

    for message in recent_history:
        content = (
            message.content
            .strip()[
                :MAX_HISTORY_CHARACTERS_PER_MESSAGE
            ]
        )

        if not content:
            continue

        cleaned.append(
            {
                "role":
                    message.role,

                "content":
                    content,
            }
        )

    # Remove a duplicated current question if the browser already
    # included it as the last history entry.
    if (
        cleaned
        and cleaned[-1]["role"] == "user"
        and cleaned[-1]["content"].strip()
        == current_message.strip()
    ):
        cleaned.pop()

    return cleaned


# ============================================================
# Routes
# ============================================================

@app.get("/")
async def root() -> dict:
    return {
        "service":
            "AI Chat",

        "status":
            "ok",

        "model":
            OLLAMA_MODEL,

        "languages": [
            "en",
            "km",
        ],
    }


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": (
            "ok"
            if OLLAMA_API_KEY
            else "missing_api_key"
        ),

        "model":
            OLLAMA_MODEL,

        "ollama_api_base":
            OLLAMA_API_BASE,

        "num_predict":
            OLLAMA_NUM_PREDICT,

        "thinking":
            get_thinking_setting(),

        "languages": [
            "en",
            "km",
        ],
    }


@app.post("/api/chat")
async def chat(
    request_body: ChatRequest,
    request: Request,
) -> dict:
    # --------------------------------------------------------
    # Rate limit
    # --------------------------------------------------------

    enforce_rate_limit(
        request
    )

    # --------------------------------------------------------
    # Validate API key
    # --------------------------------------------------------

    if not OLLAMA_API_KEY:
        raise HTTPException(
            status_code=500,
            detail=(
                "The AI service is not "
                "configured correctly."
            ),
        )

    # --------------------------------------------------------
    # Validate message
    # --------------------------------------------------------

    user_message = (
        request_body.message
        .strip()
    )

    if (
        len(user_message)
        > MAX_USER_CHARACTERS
    ):
        raise HTTPException(
            status_code=413,
            detail=(
                "Your message is too long. "
                f"Please keep it below "
                f"{MAX_USER_CHARACTERS} characters."
            ),
        )

    # --------------------------------------------------------
    # Build language-aware system prompt
    # --------------------------------------------------------

    system_prompt = (
        build_system_prompt(
            request_body.language
        )
    )

    # --------------------------------------------------------
    # Conversation history
    # --------------------------------------------------------

    history = clean_history(
        request_body.history,
        user_message,
    )

    prepared_user_message = prepare_user_message(
        user_message,
        request_body.language,
    )

    print(
        f"AI Chat request language={request_body.language}"
    )

    messages = [
        {
            "role":
                "system",

            "content":
                system_prompt,
        },

        *history,

        {
            "role":
                "user",

            "content":
                prepared_user_message,
        },
    ]

    # --------------------------------------------------------
    # Ollama payload
    # --------------------------------------------------------

    payload = {
        "model":
            OLLAMA_MODEL,

        "messages":
            messages,

        "stream":
            False,

        "think":
            get_thinking_setting(),

        "options": {
            "temperature":
                0.25,

            "num_predict":
                OLLAMA_NUM_PREDICT,
        },
    }

    headers = {
        "Authorization":
            f"Bearer {OLLAMA_API_KEY}",

        "Content-Type":
            "application/json",

        "Accept":
            "application/json",
    }

    # --------------------------------------------------------
    # Send request to Ollama Cloud
    # --------------------------------------------------------

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(
                REQUEST_TIMEOUT_SECONDS
            )
        ) as client:
            response = (
                await client.post(
                    f"{OLLAMA_API_BASE}/chat",
                    headers=headers,
                    json=payload,
                )
            )

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail=(
                "The AI model took too long "
                "to respond. Please try again."
            ),
        )

    except httpx.RequestError as exc:
        print(
            "Ollama connection error:",
            repr(exc),
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "The AI model service is "
                "temporarily unavailable."
            ),
        ) from exc

    # --------------------------------------------------------
    # Ollama HTTP error
    # --------------------------------------------------------

    if response.status_code >= 400:
        print(
            "Ollama HTTP error:",
            response.status_code,
            response.text[:1000],
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "The AI model service returned "
                "an error. Please try again."
            ),
        )

    # --------------------------------------------------------
    # Parse response
    # --------------------------------------------------------

    try:
        result = (
            response.json()
        )

    except ValueError as exc:
        print(
            "Ollama non-JSON response:",
            response.text[:1000],
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "The AI model returned an "
                "invalid response."
            ),
        ) from exc

    # --------------------------------------------------------
    # Extract answer
    # --------------------------------------------------------

    message = (
        result.get("message")
        if isinstance(
            result,
            dict,
        )
        else None
    )

    answer = ""

    if isinstance(
        message,
        dict,
    ):
        answer = (
            message.get(
                "content",
                "",
            )
            or ""
        ).strip()

    if not answer:
        done_reason = (
            result.get(
                "done_reason",
                "unknown",
            )
            if isinstance(
                result,
                dict,
            )
            else "unknown"
        )

        print(
            "Empty Ollama answer. "
            f"done_reason={done_reason}"
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "The AI model did not return "
                "a final answer. Please try again."
            ),
        )

    # --------------------------------------------------------
    # Public response
    # --------------------------------------------------------

    return {
        "answer":
            answer,

        "model":
            OLLAMA_MODEL,

        "provider":
            "Ollama Cloud",

        "language":
            request_body.language,

        "grounding": {
            "enabled":
                False,

            "type":
                None,
        },
    }
