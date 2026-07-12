"""Selection policy for the Grok bridge's Hermes xAI OAuth pool."""

from collections.abc import Iterable
from typing import Protocol


class CredentialPool(Protocol):
    """Minimal Hermes pool contract needed by the selection policy."""

    def entries(self) -> Iterable[object]:
        """Return provider credentials without exposing their secret values."""
        ...


def _priority(entry: object) -> int:
    """Return a stable numeric priority for a Hermes credential entry."""
    return int(getattr(entry, "priority", 0))


def ordered_pool_entries(pool: CredentialPool) -> list[object]:
    """Return every credential in provider priority order."""
    return sorted(list(pool.entries()), key=_priority)


def active_pool_entries(pool: CredentialPool) -> list[object]:
    """Prefer usable credentials while retaining cooldown retry recovery."""
    entries = ordered_pool_entries(pool)
    available = [
        entry
        for entry in entries
        if str(getattr(entry, "last_status", "") or "").lower() != "exhausted"
    ]
    return available or entries


def pool_attempt_count(pool: CredentialPool) -> int:
    """Allow one rotation attempt per configured credential."""
    return max(1, len(ordered_pool_entries(pool)))
