import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const artifacts = [
  {
    label: "repo bootstrap",
    file: path.join(
      repoRoot,
      "movie-buff-production-bootstrap.sql",
    ),
  },
  {
    label: "supabase bootstrap",
    file: path.join(
      repoRoot,
      "supabase",
      "migrations",
      "movie-buff-production-bootstrap.sql",
    ),
  },
  {
    label: "hosted runtime patch",
    file: path.join(
      repoRoot,
      "scripts",
      "generated",
      "movie-buff-hosted-round-runtime-patch.sql",
    ),
  },
  {
    label: "hosted source-registry patch",
    file: path.join(
      repoRoot,
      "scripts",
      "generated",
      "movie-buff-hosted-source-registry-patch.sql",
    ),
  },
];

const requiredNeedlesByArtifact = {
  "repo bootstrap": [
    "find_or_create_movie_buff_public_room",
  ],
  "supabase bootstrap": [
    "find_or_create_movie_buff_public_room",
  ],
  "hosted runtime patch": [
    "find_or_create_movie_buff_public_room",
    "answer_submitted",
    "answer_correct",
    "answer_wrong",
    "notify pgrst, 'reload schema';",
  ],
  "hosted source-registry patch": [
    "create table if not exists public.content_sources",
    "create table if not exists public.content_source_items",
    "grant select on table public.content_sources",
    "grant select on table public.content_source_items",
    "notify pgrst, 'reload schema';",
  ],
};

const result = {
  ok: true,
  checkedAt: new Date().toISOString(),
  artifacts: [],
};

for (const artifact of artifacts) {
  const artifactResult = {
    label: artifact.label,
    file: artifact.file,
    exists: false,
    present: [],
    missing: [],
  };

  if (!fs.existsSync(artifact.file)) {
    artifactResult.missing.push("FILE_MISSING");
    result.ok = false;
    result.artifacts.push(artifactResult);
    continue;
  }

  artifactResult.exists = true;
  const contents = fs.readFileSync(
    artifact.file,
    "utf8",
  );
  const requiredNeedles =
    requiredNeedlesByArtifact[artifact.label] ?? [];

  for (const needle of requiredNeedles) {
    if (contents.includes(needle)) {
      artifactResult.present.push(needle);
    } else {
      artifactResult.missing.push(needle);
      result.ok = false;
    }
  }

  result.artifacts.push(artifactResult);
}

const output = JSON.stringify(result, null, 2);

if (result.ok) {
  console.log(output);
} else {
  console.error(output);
  process.exitCode = 1;
}
