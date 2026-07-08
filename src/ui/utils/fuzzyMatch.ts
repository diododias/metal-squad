/**
 * Lightweight fuzzy matching utility for command palette filtering.
 *
 * Algorithm inspired by fzy and VSCode's fuzzy matcher:
 * - Checks if all characters from query appear in target string in order (case-insensitive)
 * - Prioritizes consecutive character matches, word boundaries, and earlier positions
 * - Returns a score where higher is better (0 = no match)
 */

export interface FuzzyMatchResult {
  /** Whether the query matches the target */
  matches: boolean;
  /** Match score (higher is better, 0 = no match) */
  score: number;
}

/**
 * Perform fuzzy matching of a query string against a target string.
 *
 * @param query - Search query (e.g., "pau")
 * @param target - Target string to match against (e.g., "Pause run")
 * @returns Match result with boolean and score
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatchResult {
  if (!query) {
    return { matches: true, score: 0 };
  }

  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  let queryIndex = 0;
  let targetIndex = 0;
  let score = 0;
  let consecutiveMatches = 0;

  while (queryIndex < queryLower.length && targetIndex < targetLower.length) {
    const queryChar = queryLower[queryIndex];
    const targetChar = targetLower[targetIndex];

    if (queryChar === targetChar) {
      // Base score for character match
      score += 1;

      // Bonus for consecutive matches
      if (consecutiveMatches > 0) {
        score += consecutiveMatches * 2;
      }
      consecutiveMatches++;

      // Bonus for match at word boundary (start of word)
      if (targetIndex === 0 || targetLower[targetIndex - 1] === ' ') {
        score += 5;
      }

      // Bonus for early position
      score += Math.max(0, 10 - targetIndex);

      queryIndex++;
    } else {
      consecutiveMatches = 0;
    }

    targetIndex++;
  }

  const matches = queryIndex === queryLower.length;
  return { matches, score: matches ? score : 0 };
}

/**
 * Filter and rank an array of strings by fuzzy matching against a query.
 *
 * @param items - Array of strings to filter
 * @param query - Search query
 * @returns Filtered and sorted array (highest score first)
 */
export function fuzzyFilter(items: string[], query: string): string[] {
  if (!query) {
    return items;
  }

  const results = items
    .map((item) => {
      const result = fuzzyMatch(query, item);
      return { item, ...result };
    })
    .filter((result) => result.matches)
    .sort((a, b) => b.score - a.score);

  return results.map((result) => result.item);
}

/**
 * Test if a query matches any of the provided strings (keywords).
 *
 * @param query - Search query
 * @param keywords - Array of strings to match against
 * @returns True if query matches at least one keyword
 */
export function matchesAny(query: string, keywords: string[]): boolean {
  if (!query) {
    return true;
  }

  return keywords.some((keyword) => fuzzyMatch(query, keyword).matches);
}
