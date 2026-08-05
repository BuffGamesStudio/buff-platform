#!/usr/bin/env python3
"""Redact credential-like values from Movie Buff evidence logs.

The redactor is dependency-free, strips terminal ANSI sequences before matching,
and understands both key=value output and Supabase's box-drawing tables.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

ANSI_ESCAPE_RE = re.compile(r"\x1B(?:\[[0-?]*[ -/]*[@-~]|[@-_])")
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b")
POSTGRES_URL_RE = re.compile(r"\bpostgres(?:ql)?://[^\s\"'<>]+", re.IGNORECASE)
SUPABASE_KEY_RE = re.compile(
    r"\bsb_(?:publishable|secret|anon|service[_-]?role)_[A-Za-z0-9._-]+\b",
    re.IGNORECASE,
)
AWS_ACCESS_KEY_RE = re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")
BEARER_RE = re.compile(r"(?i)(\bAuthorization\s*:\s*Bearer\s+)[^\s]+")
PASSWORD_RE = re.compile(r"(?i)(\bpassword\s*[=:]\s*)[^\s│|]+")

LABEL = (
    r"anon(?:ymous)?(?:[_ -]?key)?|"
    r"service[_ -]?role(?:[_ -]?key)?|"
    r"publishable(?:[_ -]?key)?|"
    r"secret(?:[_ -]?key)?|"
    r"jwt(?:[_ -]?secret)?|"
    r"s3[_ -]?access(?:[_ -]?key)?|"
    r"s3[_ -]?secret(?:[_ -]?key)?|"
    r"access[_ -]?key|"
    r"database[_ -]?(?:url|password)|"
    r"db[_ -]?(?:url|password)"
)

TABLE_ROW_RE = re.compile(
    rf"(?im)^(\s*[│|]?\s*(?:{LABEL})\s*[│|:=]\s*)([^│|\r\n]+)(\s*[│|]?\s*)$"
)
ASSIGNMENT_RE = re.compile(rf"(?i)(\b(?:{LABEL})\s*[=:]\s*)[^\s│|]+")


def redact_text(text: str) -> str:
    """Return deterministic redacted UTF-8 text."""

    result = ANSI_ESCAPE_RE.sub("", text)
    result = TABLE_ROW_RE.sub(
        lambda match: f"{match.group(1)}[REDACTED]{match.group(3)}", result
    )
    result = BEARER_RE.sub(r"\1[REDACTED]", result)
    result = PASSWORD_RE.sub(r"\1[REDACTED]", result)
    result = ASSIGNMENT_RE.sub(r"\1[REDACTED]", result)
    result = POSTGRES_URL_RE.sub("postgresql://[REDACTED_LOCAL_DB_URL]", result)
    result = JWT_RE.sub("[REDACTED_JWT]", result)
    result = SUPABASE_KEY_RE.sub("[REDACTED_SUPABASE_KEY]", result)
    result = AWS_ACCESS_KEY_RE.sub("[REDACTED_ACCESS_KEY]", result)
    return result


def redact_file(source: pathlib.Path, destination: pathlib.Path) -> None:
    if source.resolve() == destination.resolve():
        raise ValueError("source and destination must be different files")
    text = source.read_text(encoding="utf-8", errors="replace") if source.exists() else ""
    redacted = redact_text(text)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    temporary.write_text(redacted, encoding="utf-8", newline="\n")
    temporary.replace(destination)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("destination", type=pathlib.Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        redact_file(args.source, args.destination)
    except (OSError, ValueError) as error:
        print(f"evidence redaction failed: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
