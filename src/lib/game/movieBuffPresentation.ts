export const movieBuffDifficultyOptions = [
  {
    value: "easy",
    label: "Fan",
  },
  {
    value: "medium",
    label: "Buff",
  },
  {
    value: "hard",
    label: "Buffster",
  },
] as const;

export type MovieBuffDifficultyValue =
  (typeof movieBuffDifficultyOptions)[number]["value"];

export function getMovieBuffDifficultyLabel(
  value: string,
): string {
  const normalizedValue = value
    .trim()
    .toLowerCase();

  const matchingDifficulty =
    movieBuffDifficultyOptions.find(
      (difficulty) =>
        difficulty.value === normalizedValue,
    );

  if (matchingDifficulty) {
    return matchingDifficulty.label;
  }

  if (!normalizedValue) {
    return "";
  }

  return (
    normalizedValue.charAt(0).toUpperCase() +
    normalizedValue.slice(1)
  );
}
