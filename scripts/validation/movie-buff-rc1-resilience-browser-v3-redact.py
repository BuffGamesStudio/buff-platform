import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
FULL_DB_URL = re.compile(r"(?i)postgres(?:ql)?://[^\s\"'<>]+")
ROW = re.compile(r"(?im)^(\s*│?\s*(?:Access Key|Secret Key)\s*│\s*)([^│\r\n]+?)(\s*│\s*)$")
ASSIGN = re.compile(r"(?im)^(\s*(?:AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_DB_PASSWORD|POSTGRES_PASSWORD)\s*[:=]\s*)([^\s]+)")
JWT = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")
SB = re.compile(r"sb_(?:secret|publishable)_[A-Za-z0-9_-]+", re.I)

for path in root.rglob("*"):
    if not path.is_file() or path.suffix.lower() in {".png", ".zip"}:
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    text = ANSI.sub("", text)
    text = ROW.sub(lambda m: m.group(1) + "[REDACTED]" + m.group(2), text)
    text = ASSIGN.sub(lambda m: m.group(1) + "[REDACTED]", text)
    text = JWT.sub("[REDACTED_JWT]", text)
    text = SB.sub("[REDACTED_SUPABASE_KEY]", text)
    text = FULL_DB_URL.sub("postgresql://[REDACTED_LOCAL_DB_URL]", text)
    path.write_text(text, encoding="utf-8")

hits = []
for path in root.rglob("*"):
    if not path.is_file() or path.suffix.lower() in {".png", ".zip"}:
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    for pattern in (JWT, FULL_DB_URL, SB):
        if pattern.search(text):
            hits.append(f"{path.name}:{pattern.pattern}")
if hits:
    raise SystemExit("unredacted evidence detected: " + ",".join(hits))
