/**
 * fuzzySearch.ts
 * Smart Vietnamese fuzzy search & tokenization utility with in-memory caching.
 */

export function removeAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

// In-memory cache for normalized strings to avoid recalculating on every keystroke
const normalizationCache = new Map<string, string>();

export function getCachedNormalized(str: string): string {
  if (!str) return '';
  if (normalizationCache.has(str)) {
    return normalizationCache.get(str)!;
  }
  const norm = removeAccents(str);
  if (normalizationCache.size > 2000) {
    normalizationCache.clear(); // Prevent memory bloat
  }
  normalizationCache.set(str, norm);
  return norm;
}

export function smartFuzzySearch<T>(
  items: T[],
  getSearchableStrings: (item: T) => string[],
  searchTerm: string
): T[] {
  const query = searchTerm.trim();
  if (!query) return items;

  const normalizedQuery = getCachedNormalized(query);
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return items;

  const scored: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const rawStrings = getSearchableStrings(item);
    const normalizedStrings = rawStrings.map((s) => getCachedNormalized(s));
    const fullText = normalizedStrings.join(' ');

    let matchedTokensCount = 0;
    let score = 0;

    // Check exact full match
    if (fullText.includes(normalizedQuery)) {
      score += 100;
    }

    // Check token matches
    for (const token of queryTokens) {
      let tokenMatched = false;
      for (const normStr of normalizedStrings) {
        if (normStr.includes(token)) {
          tokenMatched = true;
          // Higher score if token matches start of word or code
          if (normStr.startsWith(token) || normStr.includes(` ${token}`)) {
            score += 25;
          } else {
            score += 10;
          }
          break;
        }
      }
      if (tokenMatched) {
        matchedTokensCount++;
      }
    }

    if (matchedTokensCount > 0) {
      score += (matchedTokensCount / queryTokens.length) * 50;
      scored.push({ item, score });
    }
  }

  // Sort by score descending (highest match score at the top)
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
