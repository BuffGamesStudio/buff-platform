#!/usr/bin/env python3
"""Deterministic in-place sanitizer for a supplied release-evidence copy root."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

TOOL_VERSION = "1.0.0"
SCHEMA_VERSION = 1
REDACTED = "[REDACTED]"
ANSI_RE = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))")
JWT_RE = re.compile(r"(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}(?![A-Za-z0-9_-])")
SUPABASE_KEY_RE = re.compile(r"\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}\b", re.I)
BEARER_RE = re.compile(r"(?i)(\bAuthorization\s*:\s*Bearer\s+)(?!\[REDACTED\])([A-Za-z0-9._~+/-]{8,}=*)")
POSTGRES_RE = re.compile(r"\bpostgres(?:ql)?://([^\s/@:]+):([^\s/@]+)@[^\s\"'<>]+", re.I)
NAMED_ASSIGN_RE = re.compile(
    r"(?i)(\b(?:DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|ACCESS_KEY|SECRET_KEY|S3_ACCESS_KEY|S3_SECRET_KEY|ACCESS_TOKEN|REFRESH_TOKEN|SESSION_TOKEN|AUTH_TOKEN|COOKIE|SESSION|TOKEN|PASSWORD)\b\s*[:=]\s*)(?!\[REDACTED\])([^\s,;|]+)"
)
LABEL_RE = re.compile(
    r"(?i)(\b(?:S3\s+)?(?:Access|Secret)\s+Key\b(?:\s*[|│┃]\s*|\s*[:=]\s*))(?!\[REDACTED\])([^\s|│┃,;]+)"
)
COOKIE_PAIR_RE = re.compile(
    r"(?i)(\b(?:sb-[A-Za-z0-9_-]+-auth-token|access_token|refresh_token|session_token|auth_token)\s*=\s*)(?!\[REDACTED\])([^;\s,]+)"
)

PATTERNS = [
    ("authorization_bearer", BEARER_RE, lambda m: m.group(1) + REDACTED),
    ("postgres_password_url", POSTGRES_RE, lambda m: REDACTED),
    ("named_assignment", NAMED_ASSIGN_RE, lambda m: m.group(1) + REDACTED),
    ("boxed_or_unboxed_key", LABEL_RE, lambda m: m.group(1) + REDACTED),
    ("cookie_or_session", COOKIE_PAIR_RE, lambda m: m.group(1) + REDACTED),
    ("supabase_key", SUPABASE_KEY_RE, lambda m: REDACTED),
    ("jwt", JWT_RE, lambda m: REDACTED),
]


def _safe_root(raw: str) -> Path:
    root = Path(raw)
    if not root.exists() or not root.is_dir():
        raise ValueError("sanitized evidence root must exist and be a directory")
    if root.is_symlink():
        raise ValueError("sanitized evidence root must not be a symlink")
    return root.resolve(strict=True)


def _files(root: Path):
    for base, dirs, files in os.walk(root, topdown=True, followlinks=False):
        base_path = Path(base)
        for name in list(dirs):
            p = base_path / name
            if p.is_symlink():
                raise ValueError(f"symlink path is not allowed: {p.relative_to(root)}")
        for name in sorted(files):
            p = base_path / name
            if p.is_symlink():
                raise ValueError(f"symlink path is not allowed: {p.relative_to(root)}")
            resolved = p.resolve(strict=True)
            if root != resolved and root not in resolved.parents:
                raise ValueError(f"path escapes sanitized root: {p.relative_to(root)}")
            yield resolved


def _looks_binary(data: bytes) -> bool:
    return b"\x00" in data[:8192]


def _remaining_classes(text: str):
    found = set()
    for cls, rx, _ in PATTERNS:
        if rx.search(text):
            found.add(cls)
    return sorted(found)


def sanitize(root_arg: str) -> dict:
    root = _safe_root(root_arg)
    scanned = []
    modified = []
    binary_skipped = []
    ansi_count = 0
    replacements = Counter()
    remaining = set()

    for p in sorted(_files(root), key=lambda x: x.relative_to(root).as_posix()):
        rel = p.relative_to(root).as_posix()
        if rel == "redaction-report.json":
            continue
        scanned.append(rel)
        data = p.read_bytes()
        if _looks_binary(data):
            binary_skipped.append(rel)
            continue
        text = data.decode("utf-8", errors="replace")
        normalized, n_ansi = ANSI_RE.subn("", text)
        ansi_count += n_ansi
        normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
        out = normalized
        for cls, rx, replacement in PATTERNS:
            out, count = rx.subn(replacement, out)
            replacements[cls] += count
        remaining.update(_remaining_classes(out))
        if out.encode("utf-8") != data:
            p.write_text(out, encoding="utf-8", newline="\n")
            modified.append(rel)

    report = {
        "schemaVersion": SCHEMA_VERSION,
        "toolVersion": TOOL_VERSION,
        "classification": "PASS" if not remaining else "FAIL",
        "filesScanned": scanned,
        "filesModified": modified,
        "binaryFilesSkipped": binary_skipped,
        "ansiNormalizationCount": ansi_count,
        "replacementCounts": {k: replacements[k] for k in sorted(replacements) if replacements[k]},
        "remainingFindingClasses": sorted(remaining),
    }
    (root / "redaction-report.json").write_text(
        json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", help="explicit sanitized-copy directory to sanitize in place")
    args = parser.parse_args()
    try:
        report = sanitize(args.root)
    except Exception as exc:
        print(f"sanitizer_error={type(exc).__name__}", file=sys.stderr)
        return 2
    print(json.dumps({"classification": report["classification"], "filesScanned": len(report["filesScanned"]), "filesModified": len(report["filesModified"])}, sort_keys=True))
    return 0 if report["classification"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
