"""Antivirus scanning of uploaded files via a ClamAV daemon (clamd).

Talks the clamd INSTREAM protocol over a TCP socket directly, so there is no
extra Python dependency. Scanning is enabled only when ``settings.clamav_host``
is set; otherwise every call is a no-op and reports 'skipped' (dev/test/CI).

Security posture: when AV *is* enabled, the caller treats an unreachable scanner
as a hard failure (fail closed) — an unscanned upload is rejected, never stored.
"""

from __future__ import annotations

import socket
import struct

from app.core.config import settings

# INSTREAM chunk size (clamd's StreamMaxLength default is 25 MB; our upload cap
# is 20 MB, so a single scan always fits).
_CHUNK = 64 * 1024


class AVUnavailable(RuntimeError):
    """The scanner is enabled but could not be reached / failed to respond."""


def av_enabled() -> bool:
    return bool(settings.clamav_host)


def scan_bytes(data: bytes) -> tuple[bool, str | None]:
    """Scan ``data`` with clamd INSTREAM.

    Returns ``(clean, signature)`` — ``(True, None)`` if clean, or
    ``(False, "<Signature>")`` if a virus was found.
    Raises :class:`AVUnavailable` if the daemon can't be reached or replies
    unexpectedly (so the caller can fail closed).
    """
    if not av_enabled():
        return True, None
    try:
        with socket.create_connection(
            (settings.clamav_host, settings.clamav_port), timeout=settings.clamav_timeout
        ) as sock:
            sock.settimeout(settings.clamav_timeout)
            sock.sendall(b"zINSTREAM\x00")
            view = memoryview(data)
            for i in range(0, len(view), _CHUNK):
                chunk = view[i : i + _CHUNK]
                sock.sendall(struct.pack("!L", len(chunk)) + chunk)
            sock.sendall(struct.pack("!L", 0))  # zero-length chunk = end of stream

            resp = b""
            while b"\x00" not in resp:
                part = sock.recv(4096)
                if not part:
                    break
                resp += part
    except (OSError, socket.timeout) as exc:  # noqa: UP041 — clarity over alias
        raise AVUnavailable(f"ClamAV unreachable: {exc}") from exc

    reply = resp.rstrip(b"\x00").decode("utf-8", "replace").strip()
    return _interpret(reply)


def _interpret(reply: str) -> tuple[bool, str | None]:
    """Parse a clamd INSTREAM reply into ``(clean, signature)``.

    e.g. ``"stream: OK"`` -> ``(True, None)``;
    ``"stream: Eicar-Test-Signature FOUND"`` -> ``(False, "Eicar-Test-Signature")``.
    """
    if reply.endswith("OK"):
        return True, None
    if reply.endswith("FOUND"):
        sig = reply.split(":", 1)[-1].strip().rsplit(" ", 1)[0].strip()
        return False, sig or "unknown"
    raise AVUnavailable(f"Unexpected ClamAV response: {reply!r}")
