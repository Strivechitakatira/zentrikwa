"""
Build the system prompt for Claude from tenant's agent config.
Feature 5 will expand this with agent files, knowledge base RAG, etc.
"""
from __future__ import annotations
from app.db.queries.messages import get_agent_config


async def build_system_prompt(client_id: str, contact_name: str | None = None) -> str:
    config = await get_agent_config(client_id)

    base_prompt = config.get("system_prompt", "")
    agent_name = config.get("name", "AI Assistant")

    parts = [
        f"You are {agent_name}, a WhatsApp Business AI assistant.",
        base_prompt,
        "",
        "Guidelines:",
        "- Keep responses concise and conversational (1-3 sentences for simple questions).",
        "- Use the customer's name if you know it.",
        "- Be warm, professional, and helpful.",
        "- If you cannot answer something, say so honestly and offer to connect them with a human agent.",
        "- Never make up information about prices, availability, or policies.",
        "- Respond in the same language the customer uses.",
    ]

    if contact_name:
        parts.append(f"\nThe customer's name is: {contact_name}")

    return "\n".join(parts)
