"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PHASE2_LIMITS } from "@/lib/phase2";

type SubmitResult = {
  correct_count: number;
  target_count: number;
  phase2_score: number;
  sentence_approved: boolean;
  sentence_target_hits: number;
  sentence_target_required: number | null;
  sentence_word_count: number;
  exact_match: boolean;
  exact_match_bonus: number;
  exact_match_available: boolean;
  already_final?: boolean;
};

type Props = {
  attemptId: string;
  onSubmitted?: (result: SubmitResult) => void;
};

type Config = {
  enabled: boolean;
  word?: string;
  wiki_url?: string;
  target_word_count?: number;
  is_final?: boolean;
  draft?: { words: string[]; sentence: string; saved_at: string | null };
};

type SaveState = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 1200;

export default function Phase2Panel({ attemptId, onSubmitted }: Props) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [wordDraft, setWordDraft] = useState("");
  const [sentence, setSentence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Guards the autosave from firing while we're still filling the form in from
  // the server, and from firing once the answer is locked.
  const hydrated = useRef(false);
  const locked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/phase2/config?attempt_id=${encodeURIComponent(attemptId)}&t=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: Config & { error?: string }) => {
        if (cancelled) return;
        if (data.error) { setError(data.error); return; }
        setConfig(data);
        locked.current = !!data.is_final;
        // Restore whatever they had typed before they closed the tab.
        if (data.draft) {
          setWords(data.draft.words || []);
          setSentence(data.draft.sentence || "");
          if ((data.draft.words?.length || 0) > 0 || data.draft.sentence) {
            setSaveState("saved");
          }
        }
        hydrated.current = true;
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [attemptId]);

  const saveDraft = useCallback(
    async (nextWords: string[], nextSentence: string) => {
      if (locked.current) return;
      setSaveState("saving");
      try {
        const res = await fetch("/api/phase2/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attempt_id: attemptId,
            words: nextWords,
            sentence: nextSentence,
          }),
        });
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    },
    [attemptId]
  );

  // Debounced autosave. Everything typed here survives a closed browser.
  const latest = useRef({ words, sentence });
  useEffect(() => { latest.current = { words, sentence }; }, [words, sentence]);

  useEffect(() => {
    if (!hydrated.current || locked.current) return;
    setSaveState("idle");
    const id = setTimeout(() => saveDraft(words, sentence), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [words, sentence, saveDraft]);

  // Flush the pending draft when the tab is hidden or closed, so a debounce
  // window that hasn't elapsed yet doesn't lose the last few keystrokes.
  useEffect(() => {
    const flush = () => {
      if (locked.current || document.visibilityState !== "hidden") return;
      const body = JSON.stringify({
        attempt_id: attemptId,
        words: latest.current.words,
        sentence: latest.current.sentence,
      });
      // sendBeacon still delivers while the page is being torn down.
      navigator.sendBeacon?.(
        "/api/phase2/draft",
        new Blob([body], { type: "application/json" })
      );
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, [attemptId]);

  function addWord(raw: string) {
    const w = raw.trim();
    if (!w) return;
    if (words.length >= PHASE2_LIMITS.MAX_WORDS) {
      setError(`Max ${PHASE2_LIMITS.MAX_WORDS} words`);
      return;
    }
    if (w.length < PHASE2_LIMITS.MIN_WORD_LEN || w.length > PHASE2_LIMITS.MAX_WORD_LEN) {
      setError(`Each word must be ${PHASE2_LIMITS.MIN_WORD_LEN}–${PHASE2_LIMITS.MAX_WORD_LEN} characters`);
      return;
    }
    if (words.some((x) => x.toLowerCase() === w.toLowerCase())) {
      setWordDraft("");
      return;
    }
    setError(null);
    setWords([...words, w]);
    setWordDraft("");
  }

  function removeWord(i: number) {
    setWords(words.filter((_, idx) => idx !== i));
  }

  async function submitFinal() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/phase2/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attempt_id: attemptId, words, sentence, final: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      locked.current = true;
      setResult(data);
      onSubmitted?.(data);
    } catch (e: any) {
      setError(e.message);
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;
  if (!config?.enabled) return null; // Phase 2 disabled globally

  if (config.is_final && !result) {
    return (
      <div className="card mx-auto mt-6 w-full max-w-md p-6 text-center">
        <div className="display text-2xl text-white">Phase 2 already submitted</div>
        <p className="mt-2 text-sm text-white/60">Your score is on the leaderboard.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="card mx-auto mt-6 w-full max-w-md p-6 text-center">
        <div className="display text-3xl text-white">
          Phase 2 <em>complete</em>
        </div>
        <p className="mt-3 text-sm text-white/70">
          You identified <span className="font-mono font-bold text-accent">{result.correct_count}</span>
          {" / "}
          <span className="font-mono text-white/80">{result.target_count}</span> target words in your tags.
        </p>
        <p className="mt-2 text-sm text-white/70">
          Your sentence used{" "}
          <span className="font-mono font-bold text-accent">{result.sentence_target_hits}</span>
          {" "}target word{result.sentence_target_hits === 1 ? "" : "s"}
          {result.sentence_target_required
            ? <> (needed <span className="font-mono text-white/80">{result.sentence_target_required}</span> for the bonus)</>
            : null}
          .
        </p>
        <div className="mt-4 flex flex-col items-center gap-2">
          {result.exact_match && (
            <span className="inline-flex rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-black shadow-glow">
              🎯 Exact sentence match! +{result.exact_match_bonus}
            </span>
          )}
          {result.sentence_approved ? (
            <span className="inline-flex rounded-full bg-accent/20 px-3 py-1 text-xs text-accent">
              ✓ Sentence bonus earned (+{PHASE2_LIMITS.SENTENCE_THRESHOLD_BONUS})
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-white/5 px-3 py-1 text-xs text-white/60">
              No sentence bonus — try using more of the article&apos;s key terms next time
            </span>
          )}
          <div className="mt-1 rounded-full bg-accent/20 px-4 py-2 text-sm font-medium text-accent">
            Phase 2 total: +{result.phase2_score} points
          </div>
        </div>
      </div>
    );
  }

  const canSubmit =
    words.length > 0 && sentence.trim().length >= PHASE2_LIMITS.MIN_SENTENCE_LEN;

  return (
    <div className="card mx-auto mt-6 w-full max-w-2xl p-6">
      <div className="text-center">
        <div className="text-xs uppercase tracking-widest text-accent">Phase 2 — Wikipedia Challenge</div>
        <h3 className="display mt-2 text-3xl text-white">
          Read about <em>{config.word}</em>
        </h3>
        <p className="mt-3 text-sm text-white/60">
          Open the Wikipedia article below. Identify relevant words from it, then write a meaningful
          sentence using them.
        </p>
        <p className="mt-2 text-xs text-white/40">
          Your work saves automatically — you can close this page and come back. Nothing is
          scored until you press <span className="text-white/70">Submit final answer</span>.
        </p>
      </div>

      <div className="mt-6 flex justify-center">
        <a
          href={config.wiki_url}
          target="_blank"
          rel="noopener noreferrer"
          className="pill-primary"
        >
          Open Wikipedia article ↗
        </a>
      </div>

      <div className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <label className="text-xs uppercase tracking-widest text-white/60">
            Relevant words ({words.length}
            {config.target_word_count ? ` — admin picked ${config.target_word_count} correct answers` : ""})
          </label>
          <SaveBadge state={saveState} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-bg-border bg-bg-soft p-3 min-h-[3rem]">
          {words.map((w, i) => (
            <span key={i} className="flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1 text-sm text-accent">
              {w}
              <button onClick={() => removeWord(i)} className="text-accent/70 hover:text-accent" aria-label={`remove ${w}`}>
                ×
              </button>
            </span>
          ))}
          <input
            value={wordDraft}
            onChange={(e) => setWordDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addWord(wordDraft);
              } else if (e.key === "Backspace" && !wordDraft && words.length > 0) {
                removeWord(words.length - 1);
              }
            }}
            placeholder={words.length === 0 ? "Type a word and press Enter…" : "Add another…"}
            className="min-w-[8rem] flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/30"
          />
        </div>
        <p className="mt-2 text-xs text-white/40">Press Enter or comma to add. Backspace on empty box removes the last word.</p>
      </div>

      <div className="mt-6">
        <label className="text-xs uppercase tracking-widest text-white/60">
          Your sentence ({sentence.length}/{PHASE2_LIMITS.MAX_SENTENCE_LEN})
        </label>
        <textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value.slice(0, PHASE2_LIMITS.MAX_SENTENCE_LEN))}
          rows={3}
          placeholder="Write a meaningful sentence using the words you found…"
          className="mt-3 w-full rounded-2xl border border-bg-border bg-bg-soft p-4 text-base text-white outline-none placeholder:text-white/30 focus:border-accent/60"
        />
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs text-white/50">
          Scoring: <span className="text-accent">{PHASE2_LIMITS.POINTS_PER_TARGET_WORD} pts</span> per target
          word you identify, plus a <span className="text-accent">+{PHASE2_LIMITS.SENTENCE_THRESHOLD_BONUS} bonus</span>{" "}
          if your sentence contains at least {PHASE2_LIMITS.MIN_TARGET_HITS_IN_SENTENCE} target words, plus a big{" "}
          <span className="text-accent">+{PHASE2_LIMITS.EXACT_MATCH_BONUS} bonus</span>{" "}
          if you type the exact target sentence.
        </p>

        {/* Two-step submit: the final answer can't be edited afterwards, so it
            shouldn't be one stray tap away. */}
        {confirming ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={submitting}
              className="pill-ghost text-sm"
            >
              Keep editing
            </button>
            <button
              onClick={submitFinal}
              disabled={submitting}
              className="pill-primary disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Yes, submit final"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setError(null); setConfirming(true); }}
            disabled={!canSubmit}
            className="pill-primary disabled:opacity-50"
          >
            Submit final answer
          </button>
        )}
      </div>

      {confirming && (
        <p className="mt-3 text-right text-xs text-amber-300/80">
          This locks your Phase 2 answer — you won&apos;t be able to change it.
        </p>
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "saving") return <span className="text-xs text-white/40">Saving…</span>;
  if (state === "saved") return <span className="text-xs text-accent/80">Draft saved ✓</span>;
  if (state === "error") return <span className="text-xs text-red-300">Couldn&apos;t save draft</span>;
  return <span className="text-xs text-white/20">Autosaves</span>;
}
