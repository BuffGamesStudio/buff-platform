import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const repoRoot = process.cwd();
const runtimePoolRoot = path.join(
  repoRoot,
  "public",
  "media",
  "movie-buff",
  "runtime-generated",
  "pool",
);

function readEnvFile(envPath) {
  const content = fs.readFileSync(envPath, "utf8");
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed
      .slice(separatorIndex + 1)
      .trim();

    values[key] = rawValue.replace(
      /^['"]|['"]$/g,
      "",
    );
  }

  return values;
}

const envPath = path.join(repoRoot, ".env.local");
const envValues = fs.existsSync(envPath)
  ? readEnvFile(envPath)
  : {};

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  envValues.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  envValues.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

function countFilesInDirectory(root) {
  if (!fs.existsSync(root)) {
    return 0;
  }

  let count = 0;
  const pending = [root];

  while (pending.length > 0) {
    const current = pending.pop();
    const entries = fs.readdirSync(current, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const absolutePath = path.join(
        current,
        entry.name,
      );

      if (entry.isDirectory()) {
        pending.push(absolutePath);
        continue;
      }

      if (
        entry.isFile() &&
        /\.(mp4|mp3)$/i.test(entry.name)
      ) {
        count += 1;
      }
    }
  }

  return count;
}

function buildPoolCounts() {
  const tiers = ["primary", "secondary"];
  const labels = ["fan", "buff", "buffster"];
  const counts = {};

  for (const tier of tiers) {
    counts[tier] = {};

    for (const label of labels) {
      counts[tier][label] = countFilesInDirectory(
        path.join(runtimePoolRoot, tier, label),
      );
    }
  }

  return counts;
}

async function main() {
  const { data, error } = await supabase
    .from("content_media")
    .select(
      "id, difficulty, is_active, is_hidden, media_type, source_url, licensing_status",
    )
    .eq("media_type", "video")
    .not("source_url", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const activeRows = rows.filter(
    (row) => row.is_active && !row.is_hidden,
  );
  const inactiveRows = rows.filter(
    (row) => !row.is_active || row.is_hidden,
  );

  const summarizeByDifficulty = (list) =>
    list.reduce((accumulator, row) => {
      const key = String(
        row.difficulty ?? "(null)",
      ).toLowerCase();
      accumulator[key] =
        (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {});

  const output = {
    sourceBackedVideoRows: rows.length,
    activeSourceBackedVideoRows: activeRows.length,
    inactiveSourceBackedVideoRows:
      inactiveRows.length,
    activeByDifficulty:
      summarizeByDifficulty(activeRows),
    inactiveByDifficulty:
      summarizeByDifficulty(inactiveRows),
    runtimePoolFileCounts:
      buildPoolCounts(),
  };

  console.log(
    JSON.stringify(output, null, 2),
  );
}

await main();
