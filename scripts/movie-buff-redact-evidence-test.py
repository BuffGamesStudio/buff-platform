#!/usr/bin/env python3
"""Executable regression tests for Movie Buff evidence redaction."""

from __future__ import annotations

import importlib.util
import pathlib
import tempfile
import unittest

SCRIPT_PATH = pathlib.Path(__file__).with_name("movie-buff-redact-evidence.py")
SPEC = importlib.util.spec_from_file_location("movie_buff_redactor", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("unable to load redactor")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class EvidenceRedactionTests(unittest.TestCase):
    def test_supabase_box_table_and_ansi_are_redacted(self) -> None:
        source = """\x1b[32m│ Publishable │ sb_publishable_local-example │\x1b[0m
│ Secret │ sb_secret_local-example │
│ JWT secret │ eyJabcdefgh.ijklmnop.qrstuvwx │
│ S3 Access Key │ AKIAABCDEFGHIJKLMNOP │
│ S3 Secret Key │ local-s3-secret │
"""
        output = MODULE.redact_text(source)
        self.assertNotIn("\x1b", output)
        for forbidden in (
            "sb_publishable_local-example",
            "sb_secret_local-example",
            "eyJabcdefgh.ijklmnop.qrstuvwx",
            "AKIAABCDEFGHIJKLMNOP",
            "local-s3-secret",
        ):
            self.assertNotIn(forbidden, output)
        self.assertGreaterEqual(output.count("[REDACTED]"), 5)

    def test_assignments_urls_bearer_and_password_are_redacted(self) -> None:
        source = """service_role_key=sb_secret_service-role
Authorization: Bearer opaque-token
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
password=supersecret
unrelated=value
"""
        output = MODULE.redact_text(source)
        for forbidden in (
            "sb_secret_service-role",
            "opaque-token",
            "postgres:postgres",
            "supersecret",
        ):
            self.assertNotIn(forbidden, output)
        self.assertIn("unrelated=value", output)
        self.assertIn("DATABASE_URL=[REDACTED]", output)

    def test_missing_source_produces_empty_destination(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            destination = root / "safe.txt"
            MODULE.redact_file(root / "missing.txt", destination)
            self.assertEqual(destination.read_text(encoding="utf-8"), "")

    def test_same_source_and_destination_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "same.txt"
            path.write_text("secret=value", encoding="utf-8")
            with self.assertRaises(ValueError):
                MODULE.redact_file(path, path)


if __name__ == "__main__":
    unittest.main()
