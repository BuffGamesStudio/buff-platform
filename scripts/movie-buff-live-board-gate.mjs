const BASE_URL =
  process.env.MOVIE_BUFF_BASE_URL ??
  "https://movie-buff-sigma.vercel.app";

const expectedCategorySlugs = [
  "action",
  "comedy",
  "classics",
  "drama",
  "horror",
  "science-fiction",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });
  const text = await response.text();
  let body = null;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `${path} returned non-JSON HTTP ${response.status}: ${text.slice(0, 160)}`,
    );
  }

  assert(
    response.ok,
    `${path} returned HTTP ${response.status}: ${JSON.stringify(body)}`,
  );

  return body;
}

async function fetchBoardPreview() {
  const response = await fetch(
    `${BASE_URL}/games/movie-buff/board-preview`,
    {
      cache: "no-store",
      headers: {
        accept: "text/html",
      },
    },
  );
  const html = await response.text();

  assert(
    response.ok,
    `/games/movie-buff/board-preview returned HTTP ${response.status}`,
  );

  return {
    deploymentId:
      html.match(/data-dpl-id="([^"]+)"/)?.[1] ?? null,
    categoryLabels: Array.from(
      html.matchAll(/aria-label="([^"]+) movie category"/g),
      ([, label]) => label,
    ),
  };
}

try {
  const [categoryPayload, boardPreview] = await Promise.all([
    fetchJson("/api/movie-buff/categories"),
    fetchBoardPreview(),
  ]);
  const categories = Array.isArray(categoryPayload.categories)
    ? categoryPayload.categories
    : [];
  const categoryBySlug = new Map(
    categories.map((category) => [category.slug, category]),
  );
  const missingApiCategories = expectedCategorySlugs.filter(
    (slug) =>
      !categoryBySlug.has(slug) ||
      Number(categoryBySlug.get(slug)?.playableClipCount ?? 0) <= 0,
  );
  const missingBoardCategories = expectedCategorySlugs.filter(
    (slug) => {
      const category = categoryBySlug.get(slug);
      const label = category?.name;
      return !label || !boardPreview.categoryLabels.includes(label);
    },
  );
  const allMovies = categoryBySlug.get("all-movies");
  const result = {
    ok:
      missingApiCategories.length === 0 &&
      missingBoardCategories.length === 0 &&
      Number(allMovies?.playableClipCount ?? 0) > 0,
    baseUrl: BASE_URL,
    deploymentId: boardPreview.deploymentId,
    apiCategories: categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      playableClipCount: category.playableClipCount,
    })),
    boardCategoryLabels: boardPreview.categoryLabels,
    missingApiCategories,
    missingBoardCategories,
  };

  if (result.ok) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        baseUrl: BASE_URL,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
