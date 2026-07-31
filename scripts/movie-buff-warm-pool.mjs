const baseUrl =
  process.env.MOVIE_BUFF_BASE_URL ??
  "http://127.0.0.1:3001";

const passes =
  Number.parseInt(
    process.env.MOVIE_BUFF_WARM_POOL_PASSES ??
      process.argv[2] ??
      "1",
    10,
  ) || 1;

const force =
  process.env.MOVIE_BUFF_WARM_POOL_FORCE ===
    "0"
    ? false
    : true;

async function callEndpoint(method, body) {
  const response = await fetch(
    `${baseUrl}/api/admin/analytics/warm-pool`,
    {
      method,
      headers: {
        "content-type": "application/json",
      },
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
      cache: "no-store",
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          status: response.status,
          payload,
        },
        null,
        2,
      ),
    );
  }

  return payload;
}

const snapshots = [];

for (let index = 0; index < passes; index += 1) {
  const result = await callEndpoint("POST", {
    force,
  });
  snapshots.push({
    pass: index + 1,
    warmSummary: result.warmSummary ?? null,
    poolStatus: result.poolStatus,
  });
}

const finalStatus = await callEndpoint("GET");

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      passes,
      force,
      snapshots,
      finalStatus: finalStatus.poolStatus,
    },
    null,
    2,
  ),
);
