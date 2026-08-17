"""Upload validation — defend against malicious / executable file uploads.

Rules enforced (defense in depth):
  * **Extension allowlist** — only the document types the platform actually
    processes are accepted.
  * **Magic-byte sniffing** — the file's real content must match its extension
    (the client-supplied Content-Type is never trusted).
  * **Executable rejection** — PE/ELF/shell-script signatures are refused
    outright, whatever the extension.
  * **Text safety** — text formats must be valid UTF-8 with no NUL bytes.
  * **Filename sanitisation** — path components and unsafe characters stripped;
    the stored object key never contains user-controlled text.
  * **Size cap.**

The stored object is written with a *sniffed* content type and later served as
an ``attachment`` (see storage.presigned_url), so a browser never renders or
executes it inline.
"""

from __future__ import annotations

import re

from fastapi import HTTPException

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

# ext -> (allowed magic prefixes | text flag, canonical content-type)
_ALLOWED: dict[str, dict] = {
    ".pdf": {"magic": [b"%PDF-"], "content_type": "application/pdf"},
    ".docx": {
        "magic": [b"PK\x03\x04"],  # OOXML is a ZIP container
        "content_type": (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ),
    },
    ".txt": {"text": True, "content_type": "text/plain"},
    ".md": {"text": True, "content_type": "text/markdown"},
    ".csv": {"text": True, "content_type": "text/csv"},
}

# Signatures that must never be accepted, regardless of extension.
_EXECUTABLE_SIGNATURES = (b"MZ", b"\x7fELF", b"#!", b"\xca\xfe\xba\xbe")

ALLOWED_EXTENSIONS = tuple(_ALLOWED.keys())


def sanitize_filename(name: str) -> str:
    base = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base).strip()
    base = re.sub(r"_{2,}", "_", base)[:200]
    return base or "upload"


def _extension(name: str) -> str:
    return ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""


def validate_upload(filename: str, data: bytes) -> tuple[str, str, str]:
    """Validate an upload. Returns (safe_filename, content_type, extension) or
    raises HTTPException (400/413/415)."""
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit")

    safe = sanitize_filename(filename)
    ext = _extension(safe)
    spec = _ALLOWED.get(ext)
    if not spec:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    head = data[:16]
    if any(head.startswith(sig) for sig in _EXECUTABLE_SIGNATURES):
        raise HTTPException(status_code=415, detail="Executable files are not allowed")

    if spec.get("text"):
        if b"\x00" in data[:65536]:
            raise HTTPException(status_code=415, detail="File is not valid text")
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=415, detail="Text files must be UTF-8")
    else:
        if not any(data.startswith(m) for m in spec["magic"]):
            raise HTTPException(
                status_code=415,
                detail="File content does not match its extension",
            )

    return safe, spec["content_type"], ext
