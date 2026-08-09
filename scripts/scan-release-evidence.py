#!/usr/bin/env python3
"""Independent fail-closed credential-shape scanner for sanitized release evidence."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

REDACTED = "[REDACTED]"
JWT_RE = re.compile(r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?![A-Za-z0-9_-])")
SUPABASE_KEY_RE = re.compile(r"\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}\b", re.I)
BEARER_RE = re.compile(r"(?i)\bAuthorization\s*:\s*Bearer\s+(?!\[REDACTED\])([A-Za-z0-9._~+/-]{8,}=*)")
POSTGRES_RE = re.compile(r"\bpostgres(?:ql)?://[^\s/@:]+:[^\s/@]+@[^\s\"'<>]+", re.I)
NAMED_ASSIGN_RE = re.compile(r"(?i)\b(?:DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ACCESS_KEY|SECRET_KEY|S3_ACCESS_KEY|S3_SECRET_KEY|ACCESS_TOKEN|REFRESH_TOKEN|SESSION_TOKEN|AUTH_TOKEN|COOKIE|SESSION|TOKEN|PASSWORD)\b\s*[:=]\s*(?!\[REDACTED\])[^\s,;|]+")
LABEL_RE = re.compile(r"(?i)\b(?:S3\s+)?(?:Access|Secret)\s+Key\b(?:\s*[|│┃]\s*|\s*[:=]\s*)(?!\[REDACTED\])[^\s|│┃,;]+")
COOKIE_PAIR_RE = re.compile(r"(?i)\b(?:sb-[A-Za-z0-9_-]+-auth-token|access_token|refresh_token|session_token|auth_token)\s*=\s*(?!\[REDACTED\])[^;\s,]+")
PATTERNS = [
    ("authorization_bearer", BEARER_RE),
    ("postgres_password_url", POSTGRES_RE),
    ("named_assignment", NAMED_ASSIGN_RE),
    ("boxed_or_unboxed_key", LABEL_RE),
    ("cookie_or_session", COOKIE_PAIR_RE),
    ("supabase_key", SUPABASE_KEY_RE),
    ("jwt", JWT_RE),
]


def root_path(raw: str) -> Path:
    p = Path(raw)
    if not p.exists() or not p.is_dir() or p.is_symlink():
        raise ValueError("scan root must be an existing non-symlink directory")
    return p.resolve(strict=True)


def iter_files(root: Path):
    for base, dirs, files in os.walk(root, topdown=True, followlinks=False):
        bp = Path(base)
        for d in list(dirs):
            if (bp / d).is_symlink():
                raise ValueError(f"symlink path is not allowed: {(bp / d).relative_to(root)}")
        for name in sorted(files):
            p = bp / name
            if p.is_symlink():
                raise ValueError(f"symlink path is not allowed: {p.relative_to(root)}")
            rp = p.resolve(strict=True)
            if root != rp and root not in rp.parents:
                raise ValueError(f"path escapes scan root: {p.relative_to(root)}")
            yield rp


def scan(root_arg: str):
    root = root_path(root_arg)
    findings = []
    for p in sorted(iter_files(root), key=lambda x: x.relative_to(root).as_posix()):
        data = p.read_bytes()
        if b"\x00" in data[:8192]:
            continue
        text = data.decode("utf-8", errors="replace")
        rel = p.relative_to(root).as_posix()
        for cls, rx in PATTERNS:
            if rx.search(text):
                findings.append({"class": cls, "path": rel})
    findings.sort(key=lambda x: (x["path"], x["class"]))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root")
    args = parser.parse_args()
    try:
        findings = scan(args.root)
    except Exception as exc:
        print(f"scanner_error={type(exc).__name__}", file=sys.stderr)
        return 2
    payload = {"classification": "PASS" if not findings else "FAIL", "findings": findings}
    print(json.dumps(payload, sort_keys=True))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
