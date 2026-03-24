"""
Claude API wrapper — converts DB message history to Claude messages and returns response text.
"""
from __future__ import annotations
import logging
import anthropic
from app.core.config import settings

logger = logging.getLogger(__name__)


async def call_claude(
    system_prompt: str,
    history: list[dict],
) -> str:
    """
    Call Claude with the conversation history.

    history: list of message dicts with keys: direction, body
    Returns the AI response text.
    Raises anthropic.APIError on failure — caller handles retry.
    """
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Convert DB rows to Claude message format
    messages: list[dict] = []
    for msg in history:
        body = msg.get("body") or ""
        if not body.strip():
            continue  # skip empty/media-only messages
        role = "user" if msg["direction"] == "inbound" else "assistant"
        # Merge consecutive same-role messages (Claude requires alternating)
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += f"\n{body}"
        else:
            messages.append({"role": role, "content": body})

    # Claude requires the last message to be from the user
    if not messages or messages[-1]["role"] != "user":
        logger.warning("No user message in history — skipping AI response")
        return ""

    response = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    )

    text = response.content[0].text if response.content else ""
    logger.info("Claude responded (%d chars)", len(text))
    return text
