#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

redactor = load("redactor", "redact-release-evidence.py")
scanner = load("scanner", "scan-release-evidence.py")

class HygieneTests(unittest.TestCase):
    def make_root(self):
        td = tempfile.TemporaryDirectory()
        self.addCleanup(td.cleanup)
        return Path(td.name)

    def test_structure_ansi_table_assignments_urls_and_tokens(self):
        root = self.make_root()
        secret_jwt = "eyJabcd1234.abcdefghijk.zyxwvutsrq"
        text = (
            "\x1b[31m│ S3 Access Key │ AKIAEXAMPLE123456 │\x1b[0m\r\n"
            "Secret Key: verysecretvalue\r\n"
            "SUPABASE_SERVICE_ROLE_KEY=sb_secret_abcdefghijklmnop\r\n"
            f"Authorization: Bearer {secret_jwt}\r\n"
            "DATABASE_URL=postgresql://user:pass@example.test:5432/db\r\n"
            "access_token=session-secret-value\r\n"
            "safe=keep-me\r\n"
        )
        (root / "evidence.log").write_bytes(text.encode())
        report = redactor.sanitize(str(root))
        out = (root / "evidence.log").read_text()
        self.assertEqual(report["classification"], "PASS")
        self.assertNotIn("AKIAEXAMPLE", out)
        self.assertNotIn("verysecretvalue", out)
        self.assertNotIn("sb_secret_", out)
        self.assertNotIn("eyJabcd", out)
        self.assertNotIn("user:pass@", out)
        self.assertNotIn("session-secret-value", out)
        self.assertIn("safe=keep-me", out)
        self.assertNotIn("\x1b", out)
        self.assertEqual(scanner.scan(str(root)), [])

    def test_multiple_credentials_per_line(self):
        root = self.make_root()
        (root / "x.txt").write_text("AWS_ACCESS_KEY_ID=AKIAEXAMPLE123 AWS_SECRET_ACCESS_KEY=abcdef0123456789\n")
        redactor.sanitize(str(root))
        out = (root / "x.txt").read_text()
        self.assertNotIn("AKIAEXAMPLE", out)
        self.assertNotIn("abcdef0123456789", out)
        self.assertEqual(scanner.scan(str(root)), [])

    def test_binary_and_malformed_utf8(self):
        root = self.make_root()
        (root / "binary.bin").write_bytes(b"abc\x00sb_secret_should_not_parse")
        (root / "bad.log").write_bytes(b"prefix\xff TOKEN=shhhsecret suffix")
        report = redactor.sanitize(str(root))
        self.assertIn("binary.bin", report["binaryFilesSkipped"])
        self.assertIn("[REDACTED]", (root / "bad.log").read_text(errors="replace"))
        self.assertEqual(scanner.scan(str(root)), [])

    def test_nested_spaces_dotfiles_and_line_endings(self):
        root = self.make_root()
        nested = root / "nested dir"
        nested.mkdir()
        (nested / ".env").write_bytes(b"TOKEN=abc123456789\r\nname=value\r\n")
        redactor.sanitize(str(root))
        data = (nested / ".env").read_bytes()
        self.assertNotIn(b"\r", data)
        self.assertIn(b"TOKEN=[REDACTED]", data)

    def test_deterministic_repeated_input(self):
        root1 = self.make_root()
        root2 = self.make_root()
        raw = '{"token":"eyJaaaa1111.bbbb2222.cccc3333"}\n'
        (root1 / "one.json").write_text(raw)
        (root2 / "one.json").write_text(raw)
        report1 = redactor.sanitize(str(root1))
        report2 = redactor.sanitize(str(root2))
        self.assertEqual((root1 / "one.json").read_bytes(), (root2 / "one.json").read_bytes())
        self.assertEqual(report1, report2)
        self.assertEqual(scanner.scan(str(root1)), [])
        self.assertEqual(scanner.scan(str(root2)), [])

    def test_scanner_fails_without_echoing_secret_material(self):
        root = self.make_root()
        secret = "sb_secret_abcdefghijklmnop"
        (root / "unsafe.txt").write_text(f"value={secret}\n")
        findings = scanner.scan(str(root))
        self.assertTrue(findings)
        rendered = json.dumps(findings)
        self.assertNotIn(secret, rendered)
        self.assertEqual(findings[0]["path"], "unsafe.txt")

    def test_safe_near_miss_passwordless_postgres_url(self):
        root = self.make_root()
        benign = "postgresql://db.example.test/app\n"
        (root / "safe.txt").write_text(benign)
        redactor.sanitize(str(root))
        self.assertEqual((root / "safe.txt").read_text(), benign)
        self.assertEqual(scanner.scan(str(root)), [])

    def test_root_missing_is_failure(self):
        with self.assertRaises(ValueError):
            redactor.sanitize("/definitely/not/here")

    @unittest.skipUnless(hasattr(os, "symlink"), "symlink unavailable")
    def test_symlink_containment_fails_closed(self):
        root = self.make_root()
        outside = self.make_root()
        target = outside / "secret.txt"
        target.write_text("TOKEN=outside-secret")
        try:
            os.symlink(target, root / "link.txt")
        except OSError:
            self.skipTest("symlink creation unavailable")
        with self.assertRaises(ValueError):
            redactor.sanitize(str(root))
        with self.assertRaises(ValueError):
            scanner.scan(str(root))

if __name__ == "__main__":
    unittest.main(verbosity=2)
