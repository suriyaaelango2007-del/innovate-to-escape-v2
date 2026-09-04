"use client";

import { useCallback, useEffect, useState } from "react";

type WordMetaEntry = { url?: string; target_words?: string[]; target_sentence?: string };
type WordMetaMap = Record<string, WordMetaEntry>;

type Config = {
  id: number;
  mode: "classic" | "timed" | "tournament";
  max_guesses: number;
  time_limit_seconds: number;
  rounds: number;
  words: string[];
  is_open: boolean;
  phase2_enabled: boolean;
  word_meta: WordMetaMap;
  updated_at: string;
};

type Attempt = {
  id: string;
  name: string;
  roll_number: string;
  word: string;
  guess_count: number;
  solved: boolean;
  duration_ms: number;
  score: number;
  mode: string;
  started_at: string;
  finished_at: string | null;
  phase2_words: string[] | null;
  phase2_correct_count: number;
  phase2_sentence: string | null;
  phase2_sentence_approved: boolean;
  phase2_score: number;
  phase2_finished_at: string | null;
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem("adminPw");
    if (saved) {
      setPassword(saved);
      verify(saved);
    }
  }, []);

  async function verify(pw: string) {
    setLoading(true);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) {
      sessionStorage.setItem("adminPw", pw);
      setAuthed(true);
      setLoginError(null);
    } else {
      sessionStorage.removeItem("adminPw");
      setLoginError("Wrong password");
      setAuthed(false);
    }
    setLoading(false);
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-md pt-16">
        <div className="text-center">
          <h1 className="display text-4xl text-white">
            Admin <em>access</em>
          </h1>
          <p className="mt-3 text-sm text-white/60">Enter the admin password.</p>
        </div>
        <form
          className="card mt-8 flex flex-col gap-4 p-6"
          onSubmit={(e) => { e.preventDefault(); verify(password); }}
        >
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-full border border-bg-border bg-bg-soft px-4 py-3 text-base text-white outline-none placeholder:text-white/30 focus:border-accent/60"
          />
          {loginError && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {loginError}
            </div>
          )}
          <button className="pill-primary py-3 text-base" disabled={loading}>
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>
      </div>
    );
  }

  return <AdminDashboard password={password} onLogout={() => { sessionStorage.removeItem("adminPw"); setAuthed(false); setPassword(""); }} />;
}

function AdminDashboard({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [wordsInput, setWordsInput] = useState("");
  const [wordMetaInput, setWordMetaInput] = useState("");
  const [wordMetaError, setWordMetaError] = useState<string | null>(null);

  const authed = { headers: { "x-admin-password": password, "Content-Type": "application/json" } };

  const loadAll = useCallback(async () => {
    const ts = Date.now();
    const [c, a] = await Promise.all([
      fetch(`/api/admin/config?t=${ts}`, { headers: authed.headers, cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/admin/attempts?t=${ts}`, { headers: authed.headers, cache: "no-store" }).then((r) => r.json()),
    ]);
    if (c && !c.error) {
      setConfig(c);
      setWordsInput((c.words || []).join(", "));
      setWordMetaInput(JSON.stringify(c.word_meta || {}, null, 2));
    }
    if (a && !a.error) setAttempts(a.attempts || []);
  }, [password]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function saveConfig(updates: Partial<Config>) {
    setSavingConfig(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: authed.headers,
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg("❌ " + (data.error || `Save failed (${res.status})`));
        return;
      }
      setConfig(data);
      // Re-sync the editable input boxes from the server response
      setWordsInput((data.words || []).join(", "));
      setWordMetaInput(JSON.stringify(data.word_meta || {}, null, 2));
      setMsg(`✓ Saved (${(data.words || []).length} words, ${Object.keys(data.word_meta || {}).length} phase 2 entries)`);
    } catch (e: any) {
      setMsg("❌ Network error: " + (e?.message || "unknown"));
    } finally {
      setSavingConfig(false);
    }
  }

  async function saveWords() {
    const arr = wordsInput.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    await saveConfig({ words: arr });
  }

  async function saveWordMeta() {
    setWordMetaError(null);
    let parsed: any;
    try {
      parsed = JSON.parse(wordMetaInput || "{}");
    } catch (e: any) {
      setWordMetaError("Invalid JSON: " + e.message);
      return;
    }
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
      setWordMetaError("Word meta must be a JSON object");
      return;
    }
    await saveConfig({ word_meta: parsed } as any);
  }

  async function reviewSentence(attemptId: string, approved: boolean) {
    const res = await fetch("/api/admin/phase2-review", {
      method: "PATCH",
      headers: authed.headers,
      body: JSON.stringify({ attempt_id: attemptId, approved }),
    });
    const data = await res.json();
    if (res.ok) {
      setAttempts((all) =>
        all.map((a) => a.id === attemptId
          ? { ...a, phase2_sentence_approved: approved, phase2_score: data.phase2_score }
          : a));
    } else {
      alert("Review failed: " + (data.error || "unknown"));
    }
  }

  async function deleteAttempt(id: string) {
    if (!confirm("Delete this attempt?")) return;
    const res = await fetch("/api/admin/attempts", {
      method: "DELETE", headers: authed.headers, body: JSON.stringify({ id }),
    });
    if (res.ok) setAttempts((a) => a.filter((x) => x.id !== id));
  }

  async function resetAll() {
    if (!confirm("Delete ALL attempts? This cannot be undone.")) return;
    const res = await fetch("/api/admin/attempts", {
      method: "DELETE", headers: authed.headers, body: JSON.stringify({ reset_all: true }),
    });
    if (res.ok) setAttempts([]);
  }

  function downloadCsv() {
    const url = `/api/admin/export?password=${encodeURIComponent(password)}`;
    window.location.href = url;
  }

  if (!config) return <div className="pt-16 text-center text-white/60">Loading admin…</div>;

  return (
    <div className="pt-8 sm:pt-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="display text-4xl text-white">Admin <em>console</em></h1>
          <p className="mt-1 text-sm text-white/60">Configure the game and manage results.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="pill-ghost">Refresh</button>
          <button onClick={onLogout} className="pill-outline">Log out</button>
        </div>
      </div>

      {/* Persistent status banner — stays visible until next action */}
      {msg && (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
          msg.startsWith("❌")
            ? "border-red-500/40 bg-red-500/10 text-red-300"
            : "border-accent/40 bg-accent/10 text-accent"
        }`}>
          {msg}
        </div>
      )}

      {/* Game config */}
      <section className="card mt-8 p-6">
        <h2 className="display text-2xl text-white">Game <em>settings</em></h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-widest text-white/60">Mode</span>
            <select
              value={config.mode}
              onChange={(e) => saveConfig({ mode: e.target.value as any })}
              className="rounded-full border border-bg-border bg-bg-soft px-4 py-3 text-white outline-none focus:border-accent/60"
            >
              <option value="classic">Classic (any pace)</option>
              <option value="timed">Timed (race the clock)</option>
              <option value="tournament">Tournament (multi-round)</option>
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-widest text-white/60">
              Max guesses ({config.max_guesses})
            </span>
            <input
              type="range" min={3} max={10} value={config.max_guesses}
              onChange={(e) => saveConfig({ max_guesses: parseInt(e.target.value) })}
              className="accent-accent"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-widest text-white/60">
              Time limit ({config.time_limit_seconds}s = {Math.round(config.time_limit_seconds/60)}m)
            </span>
            <input
              type="range" min={30} max={1800} step={30} value={config.time_limit_seconds}
              onChange={(e) => saveConfig({ time_limit_seconds: parseInt(e.target.value) })}
              className="accent-accent"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-widest text-white/60">
              Rounds (tournament mode) — {config.rounds}
            </span>
            <input
              type="range" min={1} max={10} value={config.rounds}
              onChange={(e) => saveConfig({ rounds: parseInt(e.target.value) })}
              className="accent-accent"
            />
          </label>

          <label className="flex items-center gap-3 rounded-full border border-bg-border bg-bg-soft px-4 py-3 sm:col-span-2">
            <input
              type="checkbox" checked={config.is_open}
              onChange={(e) => saveConfig({ is_open: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            <span className="text-sm text-white">
              Game is <span className={config.is_open ? "text-accent" : "text-red-400"}>{config.is_open ? "OPEN" : "CLOSED"}</span> for players
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-full border border-bg-border bg-bg-soft px-4 py-3 sm:col-span-2">
            <input
              type="checkbox" checked={config.phase2_enabled}
              onChange={(e) => saveConfig({ phase2_enabled: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            <span className="text-sm text-white">
              Phase 2 (Wikipedia challenge) is <span className={config.phase2_enabled ? "text-accent" : "text-red-400"}>{config.phase2_enabled ? "ON" : "OFF"}</span>
            </span>
          </label>
        </div>

        {savingConfig && <div className="mt-3 text-xs text-white/50">Saving…</div>}
      </section>

      {/* Word list */}
      <section className="card mt-6 p-6">
        <h2 className="display text-2xl text-white">Word <em>list</em></h2>
        <p className="mt-2 text-sm text-white/60">
          Enter 5-letter words separated by commas or new lines. A word is picked at random per game.
        </p>
        <textarea
          value={wordsInput}
          onChange={(e) => setWordsInput(e.target.value)}
          rows={6}
          className="mt-4 w-full rounded-xl border border-bg-border bg-bg-soft p-4 font-mono text-sm uppercase text-white outline-none focus:border-accent/60"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={saveWords} disabled={savingConfig} className="pill-primary disabled:opacity-50">
            {savingConfig ? "Saving…" : "Save word list"}
          </button>
          <span className="text-xs text-white/50">
            {config.words.length} saved • parser sees{" "}
            <span className="text-accent">
              {wordsInput.split(/[,\n]/).map((s) => s.trim().toUpperCase())
                .filter((w) => /^[A-Z]{5}$/.test(w)).length}
            </span>
            {" "}valid 5-letter words in the box
          </span>
        </div>
      </section>

      {/* Phase 2 word metadata */}
      <section className="card mt-6 p-6">
        <h2 className="display text-2xl text-white">Phase 2 <em>word metadata</em></h2>
        <p className="mt-2 text-sm text-white/60">
          Per-word Wikipedia URL, target words, and (optional) a fixed target sentence.
          URL must be on <code>en.wikipedia.org</code>. Scoring per game:{" "}
          <span className="text-accent">5 pts</span> per target word identified,{" "}
          <span className="text-accent">+20</span> if the sentence uses ≥3 target words,{" "}
          <span className="text-accent">+40</span> if the sentence exactly matches
          <code> target_sentence</code>. Max Phase 2 = 100 (equal to Wordle max).
        </p>
        <textarea
          value={wordMetaInput}
          onChange={(e) => setWordMetaInput(e.target.value)}
          rows={14}
          spellCheck={false}
          placeholder={`{\n  "CLOUD": {\n    "url": "https://en.wikipedia.org/wiki/Cloud",\n    "target_words": ["vapor", "atmosphere", "condensation"],\n    "target_sentence": "A cloud forms when water vapor condenses into droplets in the atmosphere."\n  }\n}`}
          className="mt-4 w-full rounded-xl border border-bg-border bg-bg-soft p-4 font-mono text-xs text-white outline-none focus:border-accent/60"
        />
        {wordMetaError && (
          <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {wordMetaError}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={saveWordMeta} disabled={savingConfig} className="pill-primary disabled:opacity-50">
            {savingConfig ? "Saving…" : "Save phase 2 metadata"}
          </button>
          <span className="text-xs text-white/50">
            {Object.keys(config.word_meta || {}).length} saved • parser sees{" "}
            <span className="text-accent">
              {(() => {
                try {
                  const p = JSON.parse(wordMetaInput || "{}");
                  return typeof p === "object" && !Array.isArray(p) ? Object.keys(p).length : 0;
                } catch { return "invalid JSON"; }
              })()}
            </span>
            {" "}entries in the box
          </span>
        </div>
      </section>

      {/* Phase 2 review queue */}
      <section className="card mt-6 p-6">
        <h2 className="display text-2xl text-white">Phase 2 <em>submissions</em></h2>
        <p className="mt-2 text-sm text-white/60">
          Sentences are auto-scored: the +1 bonus is awarded if the sentence contains at least
          3 target words. You can override the decision here if needed — click Approve to force
          the bonus, or Reject to remove it.
        </p>
        <div className="mt-4 space-y-3">
          {attempts.filter((a) => a.phase2_finished_at).length === 0 && (
            <div className="rounded-xl border border-bg-border bg-bg-soft/60 p-6 text-center text-white/40">
              No phase 2 submissions yet.
            </div>
          )}
          {attempts.filter((a) => a.phase2_finished_at).map((a) => (
            <div key={a.id} className="rounded-xl border border-bg-border bg-bg-soft/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <span className="font-medium">{a.name}</span>
                    <span className="font-mono text-xs text-white/50">{a.roll_number}</span>
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-xs text-accent">{a.word}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-white/80">"{a.phase2_sentence}"</p>
                  <p className="mt-2 text-xs text-white/50">
                    Words: {(a.phase2_words || []).join(", ") || "—"}
                    {" • "}
                    Matched: {a.phase2_correct_count} • Score: <span className="text-accent">{a.phase2_score}</span>
                  </p>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    onClick={() => reviewSentence(a.id, true)}
                    className={`pill ${a.phase2_sentence_approved ? "bg-accent text-black" : "pill-ghost"}`}
                  >
                    {a.phase2_sentence_approved ? "✓ Approved" : "Approve +1"}
                  </button>
                  <button
                    onClick={() => reviewSentence(a.id, false)}
                    className={`pill ${!a.phase2_sentence_approved ? "bg-red-500/20 text-red-300 border border-red-500/40" : "pill-outline"}`}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Attempts table */}
      <section className="card mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="display text-2xl text-white">All <em>attempts</em></h2>
            <p className="mt-1 text-sm text-white/60">{attempts.length} attempts total</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadCsv} className="pill-ghost">Export CSV</button>
            <button onClick={resetAll} className="pill-outline text-red-300 hover:text-red-200 hover:border-red-500/40">
              Reset all
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-xs uppercase tracking-widest text-white/50">
              <tr className="border-b border-bg-border">
                <th className="py-3 pr-3 text-left">Name</th>
                <th className="py-3 pr-3 text-left">Roll</th>
                <th className="py-3 pr-3 text-left">Word</th>
                <th className="py-3 pr-3 text-right">Guesses</th>
                <th className="py-3 pr-3 text-right">Time</th>
                <th className="py-3 pr-3 text-right">Wordle</th>
                <th className="py-3 pr-3 text-right">Phase 2</th>
                <th className="py-3 pr-3 text-right">Total</th>
                <th className="py-3 pr-3 text-center">Solved</th>
                <th className="py-3 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id} className="border-b border-bg-border/50 text-white/80">
                  <td className="py-3 pr-3">{a.name}</td>
                  <td className="py-3 pr-3 font-mono text-white/60">{a.roll_number}</td>
                  <td className="py-3 pr-3 font-mono text-accent">{a.word}</td>
                  <td className="py-3 pr-3 text-right font-mono">{a.guess_count}</td>
                  <td className="py-3 pr-3 text-right font-mono">
                    {a.finished_at ? `${Math.round(a.duration_ms/1000)}s` : "—"}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono">{a.score}</td>
                  <td className="py-3 pr-3 text-right font-mono">{a.phase2_score || 0}</td>
                  <td className="py-3 pr-3 text-right font-mono font-semibold text-accent">{(a.score || 0) + (a.phase2_score || 0)}</td>
                  <td className="py-3 pr-3 text-center">
                    {a.solved ? "✓" : a.finished_at ? "✗" : "…"}
                  </td>
                  <td className="py-3 pr-3 text-right">
                    <button
                      onClick={() => deleteAttempt(a.id)}
                      className="text-xs text-red-300 hover:text-red-200"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {attempts.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-white/40">No attempts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
