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


ENGLISH_SYSTEM_PROMPT = """
Respond in clear, natural English unless the user explicitly
asks for another language.
""".strip()


# ============================================================
# Translation prompts
# ============================================================

KHMER_TO_ENGLISH_PROMPT = """
Translate the user's Khmer message into accurate, natural English.

STRICT REQUIREMENTS:
- Translate only.
- Do not answer the user's question.
- Do not add new information.
- Do not remove information.
- Do not summarize.
- Do not explain.
- Preserve the original meaning as closely as possible.
- Preserve proper names, technical terms, standards, model names,
  numbers, equations, acronyms, identifiers, URLs, code, and units.
- Preserve terms such as O-RAN, O-RU, O-DU, O-CU, 3GPP, AI, LLM,
  GPU, CPU, API, Python, HTTP, TCP/IP, 5G, and 6G.
- If a Khmer phrase is ambiguous, translate conservatively rather
  than guessing.
- Return only the English translation.
- Do not add labels such as "Translation:".
""".strip()


ENGLISH_TO_KHMER_PROMPT = """
Translate the English text into accurate, natural Khmer.

STRICT REQUIREMENTS:
- Translate only.
- Preserve the meaning of the English source exactly.
- Do not add facts.
- Do not remove facts.
- Do not independently answer or reinterpret the question.
- Do not introduce new examples or explanations.
- Use natural, modern Khmer rather than literal word-for-word translation.
- Keep important technical terms in English when that is clearer or
  technically more accurate.
- Prefer Khmer-first explanations with useful English technical terms
  in parentheses.
- Preserve proper names, standards, model names, numbers, equations,
  acronyms, identifiers, URLs, code, and units.
- Preserve established technical terms such as O-RAN, O-RU, O-DU,
  O-CU, Near-RT RIC, E2, A1, 3GPP, AI, LLM, GPU, CPU, API, Python,
  HTTP, TCP/IP, 5G, and 6G.
- Never invent a Khmer technical term if no natural equivalent exists.
- If a proper name has no standard Khmer form, keep the original name.
- Return only the Khmer translation.
- Do not add labels such as "Translation:".
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
    message: str = Field(
        min_length=1,
        max_length=MAX_USER_CHARACTERS,
    )

    history: list[HistoryMessage] = Field(
        default_factory=list
    )

    language: Literal[
        "en",
        "km",
    ] = "en"


# ============================================================
# FastAPI
# ============================================================

app = FastAPI(
    title="AI Chat API",
    description=(
        "General-purpose bilingual English/Khmer AI chat "
        "interface backed by Ollama Cloud."
    ),
    version="6.0.0",
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


def build_system_prompt() -> str:
    return (
        SYSTEM_PROMPT
        + "\n\n"
        + ENGLISH_SYSTEM_PROMPT
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

    # Remove duplicated current question if the browser
    # already included it as the final history entry.
    if (
        cleaned
        and cleaned[-1]["role"] == "user"
        and cleaned[-1]["content"].strip()
        == current_message.strip()
    ):
        cleaned.pop()

    return cleaned


# ============================================================
# Ollama client
# ============================================================

async def call_ollama(
    messages: list[dict[str, str]],
    *,
    thinking=None,
) -> str:

    if thinking is None:
        thinking = get_thinking_setting()

    payload = {
        "model":
            OLLAMA_MODEL,

        "messages":
            messages,

        "stream":
            False,

        "think":
            thinking,
    }

    headers = {
        "Authorization":
            f"Bearer {OLLAMA_API_KEY}",

        "Content-Type":
            "application/json",

        "Accept":
            "application/json",
    }

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(
                REQUEST_TIMEOUT_SECONDS
            )
        ) as client:
            response = await client.post(
                f"{OLLAMA_API_BASE}/chat",
                headers=headers,
                json=payload,
            )

    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "The AI model took too long "
                "to respond. Please try again."
            ),
        ) from exc

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

    if response.status_code >= 400:
        error_text = response.text[:1000]

        print(
            "Ollama HTTP error:",
            response.status_code,
            error_text,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "The AI model service returned "
                "an error. Please try again."
            ),
        )

    try:
        result = response.json()

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

    message = (
        result.get("message")
        if isinstance(
            result,
            dict,
        )
        else None
    )

    if not isinstance(
        message,
        dict,
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "The AI model returned an "
                "invalid message."
            ),
        )

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
                "a final answer."
            ),
        )

    return answer


# ============================================================
# Translation functions
# ============================================================

async def translate_khmer_to_english(
    khmer_text: str,
) -> str:

    messages = [
        {
            "role":
                "system",

            "content":
                KHMER_TO_ENGLISH_PROMPT,
        },
        {
            "role":
                "user",

            "content":
                khmer_text,
        },
    ]

    return await call_ollama(
        messages,
        thinking=False,
    )


async def translate_english_to_khmer(
    english_text: str,
) -> str:

    messages = [
        {
            "role":
                "system",

            "content":
                ENGLISH_TO_KHMER_PROMPT,
        },
        {
            "role":
                "user",

            "content":
                english_text,
        },
    ]

    return await call_ollama(
        messages,
        thinking=False,
    )


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

        "khmer_pipeline":
            "translation-assisted",
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

        "khmer_pipeline":
            "km->en->AI->km",
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
    # Validate user message
    # --------------------------------------------------------

    user_message = (
        request_body.message
        .strip()
    )

    if not user_message:
        raise HTTPException(
            status_code=422,
            detail="Message cannot be empty.",
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

    print(
        f"AI Chat request language={request_body.language}"
    )

    # ========================================================
    # KHMER MODE
    #
    # Khmer user input
    #     -> translate to English
    #     -> reason / answer in English
    #     -> translate final answer to Khmer
    # ========================================================

    if request_body.language == "km":

        english_question = (
            await translate_khmer_to_english(
                user_message
            )
        )

        print(
            "Khmer -> English:",
            english_question[:500],
        )

        english_messages = [
            {
                "role":
                    "system",

                "content":
                    build_system_prompt(),
            },
            {
                "role":
                    "user",

                "content":
                    english_question,
            },
        ]

        english_answer = await call_ollama(
            english_messages,
            thinking=get_thinking_setting(),
        )

        khmer_answer = (
            await translate_english_to_khmer(
                english_answer
            )
        )

        return {
            "answer":
                khmer_answer,

            "model":
                OLLAMA_MODEL,

            "provider":
                "Ollama Cloud",

            "language":
                "km",

            "pipeline":
                "km->en->AI->km",

            "grounding": {
                "enabled":
                    False,

                "type":
                    None,
            },
        }

    # ========================================================
    # ENGLISH MODE
    #
    # Preserve the existing conversation-history behavior.
    # ========================================================

    history = clean_history(
        request_body.history,
        user_message,
    )

    messages = [
        {
            "role":
                "system",

            "content":
                build_system_prompt(),
        },

        *history,

        {
            "role":
                "user",

            "content":
                user_message,
        },
    ]

    answer = await call_ollama(
        messages,
        thinking=get_thinking_setting(),
    )

    return {
        "answer":
            answer,

        "model":
            OLLAMA_MODEL,

        "provider":
            "Ollama Cloud",

        "language":
            "en",

        "pipeline":
            "direct",

        "grounding": {
            "enabled":
                False,

            "type":
                None,
        },
    }
