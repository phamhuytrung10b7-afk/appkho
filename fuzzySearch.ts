/**
 * fuzzySearch.ts
 * High-performance Smart & Fuzzy Search engine with In-Memory RAM Caching.
 * 
 * Features:
 * 1. Supports discrete, out-of-order keywords (từ khóa rời rạc, viết nhớ máng máng).
 * 2. Automatic tokenization, accent-insensitive Vietnamese (bỏ dấu tiếng Việt), case-insensitive.
 * 3. Multi-tier ranking & scoring: Exact Match > Prefix Match > Word Boundary > Substring > Fuzzy Edit Distance.
 * 4. In-Memory RAM Caching: Pre-normalizes & pre-tokenizes datasets once so typing 1-2 characters
 *    is near instantaneous without string cutting or accent stripping on every keystroke.
 */

/**
 * Remove Vietnamese accents and convert to lowercase standard ASCII.
 * Handles combined diacritics, đ/Đ, and common typographic variants.
 */
export function removeAccents(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Fast single-string normalization cache to avoid repeated string computations.
 */
const stringNormCache = new Map<string, string>();
const MAX_STRING_CACHE_SIZE = 5000;

export function getCachedNormalized(str: string): string {
  if (!str) return '';
  const cached = stringNormCache.get(str);
  if (cached !== undefined) {
    return cached;
  }
  const normalized = removeAccents(str);
  if (stringNormCache.size >= MAX_STRING_CACHE_SIZE) {
    stringNormCache.clear();
  }
  stringNormCache.set(str, normalized);
  return normalized;
}

/**
 * Pre-computed In-Memory RAM representation for any searchable item.
 */
export interface PrecomputedItem<T> {
  item: T;
  rawStrings: string[];
  normalizedStrings: string[];
  fullNormalizedText: string;
  allWords: string[]; // Discrete pre-split words
}

// Global WeakMap/Map to retain In-Memory RAM cache across renders without recalculating
const itemPrecomputedCache = new WeakMap<object, PrecomputedItem<any>>();
const fallbackCache = new Map<string, PrecomputedItem<any>>();

/**
 * Get or create pre-computed RAM cache entry for an item.
 */
export function getOrCreatePrecomputedItem<T>(
  item: T,
  getSearchableStrings: (item: T) => string[]
): PrecomputedItem<T> {
  if (item && typeof item === 'object') {
    const cached = itemPrecomputedCache.get(item);
    if (cached) return cached;
  }

  const rawStrings = getSearchableStrings(item);
  const normalizedStrings = rawStrings.map((s) => getCachedNormalized(s));
  const fullNormalizedText = normalizedStrings.join(' ');
  
  // Extract discrete words (alphanumeric tokens)
  const allWords = Array.from(
    new Set(
      fullNormalizedText
        .split(/[^a-z0-9]+/i)
        .filter((w) => w.length > 0)
    )
  );

  const precomputed: PrecomputedItem<T> = {
    item,
    rawStrings,
    normalizedStrings,
    fullNormalizedText,
    allWords,
  };

  if (item && typeof item === 'object') {
    itemPrecomputedCache.set(item, precomputed);
  }

  return precomputed;
}

/**
 * Check if string B is a subsequence of string A (allows fuzzy typos/missing chars).
 * E.g., 'blong' is subsequence of 'bulong'.
 */
function isSubsequence(pattern: string, text: string): boolean {
  if (pattern.length > text.length) return false;
  let pIdx = 0;
  for (let tIdx = 0; tIdx < text.length && pIdx < pattern.length; tIdx++) {
    if (text[tIdx] === pattern[pIdx]) {
      pIdx++;
    }
  }
  return pIdx === pattern.length;
}

/**
 * Calculate match score for a single query token against pre-computed item data.
 */
function scoreTokenMatch<T>(token: string, precomputed: PrecomputedItem<T>): number {
  const { normalizedStrings, fullNormalizedText, allWords } = precomputed;

  // 1. Exact match on primary code (usually first searchable string)
  if (normalizedStrings[0] === token) {
    return 1000;
  }

  // 2. Exact match on any searchable string
  for (const str of normalizedStrings) {
    if (str === token) return 600;
  }

  // 3. Prefix match on primary code
  if (normalizedStrings[0]?.startsWith(token)) {
    return 500;
  }

  // 4. Exact word match in words list
  for (const word of allWords) {
    if (word === token) return 300;
  }

  // 5. Word starts with token
  for (const word of allWords) {
    if (word.startsWith(token)) return 200;
  }

  // 6. Substring match inside any string
  for (const str of normalizedStrings) {
    if (str.includes(token)) return 100;
  }

  // 7. Subsequence / Vague fuzzy match (for tokens >= 3 chars)
  if (token.length >= 3) {
    for (const word of allWords) {
      if (word.length >= token.length && isSubsequence(token, word)) {
        return 50;
      }
    }
  }

  return 0;
}

/**
 * Main Smart Fuzzy Search function.
 * 
 * @param items List of raw items to search
 * @param getSearchableStrings Function returning array of attributes to match (e.g. [code, name, location, barcode])
 * @param query Search query from user
 * @returns Filtered items sorted by highest relevance score
 */
export function smartFuzzySearch<T>(
  items: T[],
  getSearchableStrings: (item: T) => string[],
  query: string
): T[] {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) return items;

  const normalizedQuery = getCachedNormalized(cleanQuery);
  // Split query into discrete tokens
  const queryTokens = normalizedQuery
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);

  if (queryTokens.length === 0) return items;

  // Pre-load RAM cache for all items
  const precomputedList = items.map((item) =>
    getOrCreatePrecomputedItem(item, getSearchableStrings)
  );

  const scoredResults: Array<{ item: T; totalScore: number }> = [];

  for (const pre of precomputedList) {
    let allTokensMatched = true;
    let sumScore = 0;
    let matchedTokenCount = 0;

    // Check full query phrase exact match bonus
    if (pre.fullNormalizedText.includes(normalizedQuery)) {
      sumScore += 400;
    }

    // Score each discrete token
    for (const token of queryTokens) {
      const tokenScore = scoreTokenMatch(token, pre);
      if (tokenScore > 0) {
        matchedTokenCount++;
        sumScore += tokenScore;
      } else {
        allTokensMatched = false;
      }
    }

    // If query has multiple tokens, penalize items that don't match all tokens
    if (queryTokens.length > 1) {
      if (allTokensMatched) {
        sumScore += 500; // HUGE bonus for matching ALL discrete tokens
      } else if (matchedTokenCount / queryTokens.length < 0.5) {
        // Did not match at least half of the tokens, drop it
        continue;
      }
    } else if (matchedTokenCount === 0) {
      continue;
    }

    if (sumScore > 0) {
      scoredResults.push({ item: pre.item, totalScore: sumScore });
    }
  }

  // Sort by relevance score descending
  scoredResults.sort((a, b) => b.totalScore - a.totalScore);

  return scoredResults.map((r) => r.item);
}
