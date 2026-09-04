import Link from "next/link";

export default function Home() {
  return (
    <div className="pt-10 sm:pt-16">
      {/* Hero */}
      <section className="relative flex flex-col items-center text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-bg-border bg-bg-card/60 px-4 py-1.5 text-xs uppercase tracking-widest text-white/60 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-glow" />
          Prodinno Club presents
        </span>

        <h1 className="display text-5xl leading-tight text-white sm:text-7xl md:text-8xl">
          Innovate To <em>Escape</em>
        </h1>

        <p className="mx-auto mt-8 max-w-xl text-base text-white/60 sm:text-lg">
          A wordle challenge for curious minds. Crack the puzzle, race the clock,
          and climb the leaderboard.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/play" className="pill-primary px-8 py-3 text-base">
            Play now →
          </Link>
          <Link href="/leaderboard" className="pill-ghost px-6 py-3 text-base">
            View leaderboard
          </Link>
        </div>
      </section>

      {/* Preview tiles */}
      <section className="mx-auto mt-16 flex w-full max-w-[22rem] flex-col items-center gap-2 px-2">
        {[
          ["I", "N", "N", "O", "V"],
          ["E", "S", "C", "A", "P"],
        ].map((row, i) => (
          <div key={i} className="grid w-full grid-cols-5 gap-2">
            {row.map((ch, j) => (
              <div
                key={j}
                className={`tile h-14 w-full text-2xl sm:h-16 sm:text-3xl ${
                  (i === 0 && j < 2) || (i === 1 && j === 2)
                    ? "tile-correct"
                    : (i === 0 && j === 3) || (i === 1 && j === 0)
                    ? "tile-present"
                    : "tile-absent"
                }`}
              >
                {ch}
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="mt-24 grid gap-5 sm:grid-cols-3">
        {[
          {
            n: "01",
            t: "Register",
            d: "Enter your name and roll number to join the challenge.",
          },
          {
            n: "02",
            t: "Guess",
            d: "You have limited attempts to crack the 5-letter word.",
          },
          {
            n: "03",
            t: "Escape",
            d: "Fewer guesses, faster time — climb the live leaderboard.",
          },
        ].map((step) => (
          <div key={step.n} className="card p-6">
            <div className="text-xs font-mono tracking-widest text-accent">
              {step.n}
            </div>
            <div className="mt-3 display text-2xl text-white">{step.t}</div>
            <p className="mt-2 text-sm text-white/60">{step.d}</p>
          </div>
        ))}
      </section>

      {/* Rules card */}
      <section className="mt-10 card p-8 text-center">
        <h2 className="display text-3xl text-white">
          The <em>rules</em> of the game
        </h2>
        <ul className="mx-auto mt-6 grid max-w-2xl gap-3 text-sm text-white/70 sm:grid-cols-2">
          <li className="rounded-xl border border-bg-border bg-bg-soft/60 p-4">
            <span className="text-accent">Yellow tile</span> — letter is in the correct spot
          </li>
          <li className="rounded-xl border border-bg-border bg-bg-soft/60 p-4">
            <span className="text-white/80">Grey tile</span> — letter is in the word, wrong spot
          </li>
          <li className="rounded-xl border border-bg-border bg-bg-soft/60 p-4">
            Dark tile — letter is not in the word
          </li>
          <li className="rounded-xl border border-bg-border bg-bg-soft/60 p-4">
            Speed counts — faster solves rank higher
          </li>
        </ul>
      </section>
    </div>
  );
}
