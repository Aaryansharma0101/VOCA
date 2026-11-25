"""Provider-agnostic LLM access: the only module that knows a model exists.

It speaks the OpenAI chat-completions protocol, so any compatible endpoint
works. The base URL, key and model all come from the environment; no provider
name, SDK or header appears anywhere else in the codebase.

Failure policy (spec): retry once, then raise :class:`LLMError` with a message
the UI can display. Nothing here ever invents a result to paper over a failure.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Final, TypeVar

from openai import OpenAI
from pydantic import BaseModel, ValidationError

from .config import get_settings

logger = logging.getLogger(__name__)

ModelT = TypeVar("ModelT", bound=BaseModel)

_FENCE: Final[re.Pattern[str]] = re.compile(
    r"^\s*```(?:json)?\s*(?P<body>.*?)\s*```\s*$", re.DOTALL | re.IGNORECASE
)
_JSON_HINT: Final[str] = "\n\nReturn one JSON object and nothing else. No prose, no code fences."
_MAX_ATTEMPTS: Final[int] = 2


class LLMError(RuntimeError):
    """The configured model could not produce a usable answer."""


def is_configured() -> bool:
    """True when both a model and a key are present, i.e. calls can succeed."""
    settings = get_settings()
    return bool(settings.llm_model.strip() and settings.llm_api_key.strip())


def _client() -> OpenAI:
    settings = get_settings()
    return OpenAI(
        base_url=settings.llm_base_url,
        # The SDK rejects an empty key; a placeholder makes the endpoint return
        # an auth error we can report instead of failing during import.
        api_key=settings.llm_api_key or "not-configured",
        timeout=settings.llm_timeout_seconds,
        max_retries=0,  # retries happen here, once, for every call type
    )


def _call(prompt: str, *, temperature: float) -> str:
    settings = get_settings()
    if not settings.llm_model.strip():
        raise LLMError("LLM_MODEL is not set. Add LLM_BASE_URL, LLM_API_KEY and LLM_MODEL to .env.")
    if not settings.llm_api_key.strip():
        raise LLMError("LLM_API_KEY is not set. Add it to .env to use this feature.")

    try:
        response = _client().chat.completions.create(
            model=settings.llm_model,
            temperature=temperature,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:  # transport, auth and provider errors share no base
        raise LLMError(f"The language model request failed: {exc}") from exc

    content = (response.choices[0].message.content or "") if response.choices else ""
    if not content.strip():
        raise LLMError("The language model returned an empty response.")
    return content


def _attempt_twice(operation_name: str, operation) -> object:
    """Run ``operation`` up to two times, raising ``LLMError`` if both fail."""
    last: Exception | None = None
    for attempt in (1, 2):
        try:
            return operation()
        except (LLMError, ValidationError, json.JSONDecodeError) as exc:
            last = exc
            logger.warning("%s failed (attempt %d/2): %s", operation_name, attempt, exc)
    detail = str(last) or last.__class__.__name__
    raise LLMError(f"{operation_name} failed after 2 attempts. Last error: {detail}") from last


def complete(prompt: str) -> str:
    """Return a free-text completion. Raises :class:`LLMError` on failure."""
    return str(_attempt_twice("LLM completion", lambda: _call(prompt, temperature=0.2)))


def json_completion(prompt: str, schema: type[ModelT]) -> ModelT:
    """Return a completion parsed and validated as ``schema``.

    Markdown fences are unwrapped before parsing, since models add them even when
    told not to. A malformed object triggers one retry.
    """

    def _attempt() -> ModelT:
        raw = _call(prompt + _JSON_HINT, temperature=0.0)
        match = _FENCE.match(raw)
        payload = json.loads(match.group("body") if match else raw)
        return schema.model_validate(payload)

    result = _attempt_twice(f"LLM JSON completion ({schema.__name__})", _attempt)
    return result  # type: ignore[return-value]
