import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260807014500_movie_buff_rls_helper_execute_repair.sql",
  import.meta.url,
);

const identities = [
  "public.is_movie_buff_room_member(uuid)",
  "public.is_movie_buff_match_member(uuid)",
  "public.is_movie_buff_round_member(uuid)",
];

test("RLS helper repair preserves the least-privilege browser contract", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /\bbegin\s*;/i);
  assert.match(sql, /\bcommit\s*;/i);
  assert.match(sql, /notify\s+pgrst,\s*'reload schema'/i);
  assert.match(sql, /to_regprocedure\(v_identity\)/i);

  for (const identity of identities) {
    const escapedIdentity = identity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const functionName = identity.replace("public.", "").replace("(uuid)", "");

    assert.match(sql, new RegExp(`'${escapedIdentity}'`, "i"));
    assert.match(
      sql,
      new RegExp(
        `alter\\s+function\\s+public\\.${functionName}\\(uuid\\)\\s+owner\\s+to\\s+postgres`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `alter\\s+function\\s+public\\.${functionName}\\(uuid\\)[\\s\\S]*?set\\s+search_path\\s*=\\s*pg_catalog,\\s*public`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke\\s+all\\s+on\\s+function\\s+public\\.${functionName}\\(uuid\\)[\\s\\S]*?from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role`,
        "i",
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${functionName}\\(uuid\\)[\\s\\S]*?to\\s+authenticated,\\s*service_role`,
        "i",
      ),
    );
  }

  assert.match(sql, /not\s+coalesce\(v_security_definer,\s*false\)/i);
  assert.match(sql, /has_function_privilege\('anon',\s*v_oid,\s*'execute'\)/i);
  assert.match(
    sql,
    /not\s+pg_catalog\.has_function_privilege\('authenticated',\s*v_oid,\s*'execute'\)/i,
  );
  assert.match(
    sql,
    /not\s+pg_catalog\.has_function_privilege\('service_role',\s*v_oid,\s*'execute'\)/i,
  );
});
