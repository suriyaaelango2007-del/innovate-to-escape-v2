// Shared phase-2 helpers. Used by both the API routes and (for constants only) the UI.

export const PHASE2_LIMITS = {
  MAX_WORDS: 20,
  MAX_WORD_LEN: 30,
  MIN_WORD_LEN: 2,
  MAX_SENTENCE_LEN: 500,
  MIN_SENTENCE_LEN: 10,
  // For the auto-awarded sentence bonuses:
  MIN_SENTENCE_WORD_COUNT: 5,          // must be a real sentence, not one word
  MIN_TARGET_HITS_IN_SENTENCE: 3,      // must reference at least this many target words
  // Scoring — designed so Phase 2 maxes at 100 points, matching Wordle.
  POINTS_PER_TARGET_WORD: 5,           // 8 target words × 5 = 40 max
  SENTENCE_THRESHOLD_BONUS: 20,        // +20 if sentence contains >=3 target words
  EXACT_MATCH_BONUS: 40,               // +40 for reproducing the admin's target sentence exactly
};

export const PHASE2_MAX_SCORE = 100;

// ---------------------------------------------------------------------------
// Input validation, shared by the draft and final-submit routes so a draft can
// never contain something the final submit would reject.
//
// Drafts are saved with `strict: false` — a half-finished sentence or an empty
// word list is a perfectly valid draft. The final submit uses `strict: true`,
// which additionally enforces the minimums.
// ---------------------------------------------------------------------------
export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateWords(input: unknown, strict: boolean): Validated<string[]> {
  const arr = Array.isArray(input) ? input : [];
  if (arr.length > PHASE2_LIMITS.MAX_WORDS) {
    return { ok: false, error: `Too many words (max ${PHASE2_LIMITS.MAX_WORDS})` };
  }
  const cleaned: string[] = [];
  for (const raw of arr) {
    const n = normalizeWord(typeof raw === "string" ? raw : "");
    if (!n) continue;
    if (n.length < PHASE2_LIMITS.MIN_WORD_LEN || n.length > PHASE2_LIMITS.MAX_WORD_LEN) {
      return {
        ok: false,
        error: `Words must be ${PHASE2_LIMITS.MIN_WORD_LEN}–${PHASE2_LIMITS.MAX_WORD_LEN} characters`,
      };
    }
    // Case-insensitive dedupe, so a duplicate can't be used to pad the list.
    if (!cleaned.includes(n)) cleaned.push(n);
  }
  if (strict && cleaned.length === 0) {
    return { ok: false, error: "Submit at least one word" };
  }
  return { ok: true, value: cleaned };
}

export function validateSentence(input: unknown, strict: boolean): Validated<string> {
  const s = String(input || "").trim();
  if (s.length > PHASE2_LIMITS.MAX_SENTENCE_LEN) {
    return {
      ok: false,
      error: `Sentence too long (max ${PHASE2_LIMITS.MAX_SENTENCE_LEN} characters)`,
    };
  }
  if (strict && s.length < PHASE2_LIMITS.MIN_SENTENCE_LEN) {
    return {
      ok: false,
      error: `Sentence must be at least ${PHASE2_LIMITS.MIN_SENTENCE_LEN} characters`,
    };
  }
  return { ok: true, value: s };
}

// Only accept https URLs on the English Wikipedia. This prevents an admin
// (accidentally or otherwise) from wiring the game to phishing/redirect URLs
// or javascript: URIs that would XSS via the anchor href.
const ALLOWED_WIKI_HOSTS = new Set([
  "en.wikipedia.org",
  "en.m.wikipedia.org",
  "simple.wikipedia.org",
]);

export function safeWikiUrl(url: string | null | undefined, fallbackWord: string): string {
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol === "https:" && ALLOWED_WIKI_HOSTS.has(u.hostname)) {
        return u.toString();
      }
    } catch {
      /* fall through */
    }
  }
  // Auto-fallback: capitalize first letter, lowercase the rest for Wikipedia's URL format.
  const w = String(fallbackWord || "").trim();
  if (!w) return "https://en.wikipedia.org/";
  const cap = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(cap)}`;
}

// Normalize a word for comparison: lowercase, strip surrounding punctuation.
export function normalizeWord(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]/gu, "") // keep letters/numbers/apostrophes/hyphens
    .trim();
}

export type WordMetaEntry = {
  url?: string;
  target_words?: string[];
  target_sentence?: string;
};

export type WordMetaMap = Record<string, WordMetaEntry>;

export function getMetaForWord(meta: WordMetaMap, word: string): WordMetaEntry {
  const key = word.toUpperCase();
  return meta[key] || meta[word] || {};
}

// Count how many of the player's submitted words match the admin's target list.
// Duplicates in the submission only count once each.
export function scoreWords(submitted: string[], targets: string[]): number {
  const normTargets = new Set(targets.map(normalizeWord).filter(Boolean));
  const seen = new Set<string>();
  let hits = 0;
  for (const raw of submitted) {
    const n = normalizeWord(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    if (normTargets.has(n)) hits++;
  }
  return hits;
}

// Break a sentence into normalized tokens (same rules as normalizeWord: lowercase,
// punctuation stripped). Duplicates preserved so caller can decide.
function tokenize(sentence: string): string[] {
  return String(sentence || "")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}'-]/gu, ""))
    .filter(Boolean);
}

// Count how many DISTINCT target words appear in the sentence (case-insensitive).
export function countTargetsInSentence(sentence: string, targets: string[]): number {
  const tokens = new Set(tokenize(sentence));
  const normTargets = targets.map(normalizeWord).filter(Boolean);
  let hits = 0;
  for (const t of normTargets) {
    if (tokens.has(t)) hits++;
  }
  return hits;
}

// Total meaningful word count in the sentence (used to prevent one-word "sentences"
// from qualifying for the auto-bonus).
export function sentenceWordCount(sentence: string): number {
  return tokenize(sentence).length;
}

// Canonicalize a sentence for exact-match comparison:
// lowercase, collapse whitespace, strip everything except letters/numbers/spaces.
// So "A prism, disperses light." and "a prism disperses light" both become
// "a prism disperses light" — safe against punctuation and capitalization typos.
export function canonicalSentence(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// True when the player's sentence, after canonicalization, matches the
// admin's target sentence exactly (word-for-word, same order).
export function sentenceExactMatches(submitted: string, target: string): boolean {
  const t = canonicalSentence(target);
  if (!t) return false;
  return canonicalSentence(submitted) === t;
}

// Deterministic auto-approval for the +1 bonus:
//  - sentence must have at least MIN_SENTENCE_WORD_COUNT tokens
//  - AND contain at least MIN_TARGET_HITS_IN_SENTENCE distinct target words
//    (capped by how many targets actually exist for the word — if the admin
//    configured fewer than the threshold, require all of them)
export function sentenceQualifiesForBonus(sentence: string, targets: string[]): {
  qualifies: boolean;
  hits: number;
  required: number;
  wordCount: number;
} {
  const hits = countTargetsInSentence(sentence, targets);
  const wordCount = sentenceWordCount(sentence);
  const availableTargets = targets.filter(Boolean).length;
  const required = availableTargets === 0
    ? Infinity   // no targets configured => cannot auto-qualify
    : Math.min(PHASE2_LIMITS.MIN_TARGET_HITS_IN_SENTENCE, availableTargets);
  const qualifies =
    wordCount >= PHASE2_LIMITS.MIN_SENTENCE_WORD_COUNT &&
    hits >= required;
  return { qualifies, hits, required, wordCount };
}
