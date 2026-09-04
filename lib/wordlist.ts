import { FIVE_LETTER_WORDS } from "./words-data";

export const VALID_GUESSES = new Set<string>(
  FIVE_LETTER_WORDS.map((w) => w.toUpperCase())
);

export function isValidGuess(word: string): boolean {
  return VALID_GUESSES.has(word.toUpperCase());
}

// Wordle scoring — designed to max out at 100 points so it's balanced
// against Phase 2 (also max 100). Total per game: 200 pts.
//
//   Base for solving          : 40
//   Guess efficiency (0..30)  : proportional to guesses saved
//   Speed (0..30)             : 30 - floor(seconds / 10), floored at 0
export const WORDLE_MAX_SCORE = 100;
export const WORDLE_BASE_POINTS = 40;
export const WORDLE_MAX_GUESS_BONUS = 30;
export const WORDLE_MAX_SPEED_BONUS = 30;

export function computeScore(opts: {
  solved: boolean;
  guessCount: number;
  maxGuesses: number;
  durationMs: number;
}): number {
  if (!opts.solved) return 0;

  const denom = Math.max(1, opts.maxGuesses - 1);
  const guessBonus = Math.round(
    WORDLE_MAX_GUESS_BONUS * (opts.maxGuesses - opts.guessCount) / denom
  );

  const seconds = Math.floor(opts.durationMs / 1000);
  const speedBonus = Math.max(0, WORDLE_MAX_SPEED_BONUS - Math.floor(seconds / 10));

  return WORDLE_BASE_POINTS + guessBonus + speedBonus;
}

// Compare a guess against the answer and return per-letter statuses.
export type LetterStatus = "correct" | "present" | "absent";
export function evaluateGuess(guess: string, answer: string): LetterStatus[] {
  const g = guess.toUpperCase().split("");
  const a = answer.toUpperCase().split("");
  const result: LetterStatus[] = Array(g.length).fill("absent");
  const remaining: Record<string, number> = {};

  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) {
      result[i] = "correct";
    } else {
      remaining[a[i]] = (remaining[a[i]] || 0) + 1;
    }
  }
  for (let i = 0; i < g.length; i++) {
    if (result[i] === "correct") continue;
    if (remaining[g[i]] > 0) {
      result[i] = "present";
      remaining[g[i]]--;
    }
  }
  return result;
}
