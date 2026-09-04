# Innovate To Escape — v2

A two-phase Wordle-style challenge for the **Prodinno Club**.

**Phase 1** — solve a 5-letter Wordle in limited guesses.
**Phase 2** — read a linked Wikipedia article, identify relevant words, and write a sentence using them.

Next.js 14 (App Router) · Tailwind CSS · Supabase · Clerk · Framer Motion · deployed on Vercel.


---

## What's new in v2

| Area | v1 | v2 |
|---|---|---|
| Login | Name + roll number typed into a form | **Clerk accounts** — real identity |
| Duplicate players | Same roll number silently overwrote the other person | Rejected; one attempt per player enforced **by a database index** |
| Lost guesses | Two fast Enters could drop a guess | Compare-and-swap write; a guess can't be lost or double-counted |
| Closing the browser | Came back to an empty board, or a new word | **Resumes** your exact game, timer and Phase 2 draft |
| Phase 2 | Locked on first submit | **Autosaved draft**, editable until you press *Submit final answer* |
| Timer | Client-side only; timed-out games hung open forever | Enforced **server-side** |
| Leaderboard | One row per attempt (people appeared twice) | One row per player, best attempt |
| History | none | **`/my-attempts`** — every game you've played, with full results |

---

## 0 · Before you start, read this

Copying the code into a new repo isolates the **code**. It does **not** isolate the **data**.

If you point this app at the **same Supabase project** as the original game, both apps
share the same players, attempts and leaderboard. Anything you do while testing shows up
on the live board.

Pick one:

- **Option A — new Supabase project (recommended while testing).**
  Fully isolated. The original game is untouchable. Follow [§2a](#2a--option-a--a-new-project-isolated).
- **Option B — reuse the existing Supabase project.**
  Same data as the live game. Only do this when you're ready for v2 to *become* the real
  game. See [§2b](#2b--option-b--reusing-your-existing-supabase).

The same choice applies to Clerk, but it matters much less — reusing the existing Clerk
app is fine.

---

## 1 · Prerequisites

- **Node 18+** — check with `node -v`
- A **Supabase** account — https://supabase.com
- A **Clerk** account — https://clerk.com
- A **Vercel** account — https://vercel.com
- **Git**

```bash
git clone https://github.com/<your-username>/innovate-to-escape-v2.git
cd innovate-to-escape-v2
npm install
```

---

## 2 · Supabase

### 2a · Option A — a new project (isolated)

1. https://supabase.com → **New project**. Pick a region near your campus. Save the
   database password somewhere.
2. Wait for it to finish provisioning (~2 min).
3. **Project Settings → API** → copy three values:

   | Supabase field | Goes into |
   |---|---|
   | Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
   | `anon` `public` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
   | `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

   > ⚠️ The `service_role` key bypasses all row-level security. Server-side only.
   > Never put it in a `NEXT_PUBLIC_*` variable and never commit it.

4. **SQL Editor → New query** → paste the entire contents of
   [`supabase/schema.sql`](./supabase/schema.sql) → **Run**.

   This creates `players`, `attempts` and `game_config`, seeds the config row, and
   includes every v2 column and index. **A new project needs only this file** — the
   migrations in `supabase/` are for upgrading an *existing* v1 database.

5. Confirm: **Table Editor** should now list `players`, `attempts`, `game_config`.

### 2b · Option B — reusing your existing Supabase

Your existing database was built before v2, so it needs the migrations. Run them in the
SQL Editor **in this order**, skipping any you've already run:

1. [`supabase/migration-phase2.sql`](./supabase/migration-phase2.sql) — only if your DB
   predates Phase 2
2. [`supabase/migration-multiuser.sql`](./supabase/migration-multiuser.sql) — the v2
   migration

Both are safe to re-run (`IF NOT EXISTS`). Take a snapshot first:
**Database → Backups**.

`migration-multiuser.sql` also cleans up duplicate open attempts so it can create the
unique index. It keeps each player's **oldest** open attempt; extras with no guesses are
deleted, extras with guesses are closed and flagged `expired`.

Verify with `npm run preflight` ([§6](#6--verify-everything-works)).

---

## 3 · Clerk

1. https://dashboard.clerk.com → **Create application** (or reuse your existing one).
2. Name it, then choose sign-in methods. For a campus event:
   - **Email verification code** — least friction, nothing to forget
   - **Google** — fastest if students have college Google accounts
   - Email + **password** works but means forgotten passwords on event day
3. **API Keys** → copy:

   | Clerk field | Goes into |
   |---|---|
   | Publishable key | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |
   | Secret key | `CLERK_SECRET_KEY` |

4. Optional but recommended: **Configure → Restrictions** — limit sign-ups to your
   college email domain so outsiders can't get on the leaderboard. (Some restriction
   features need a paid plan.)

### ⚠️ Development vs production keys

Clerk gives you `pk_test_` / `sk_test_` keys by default. They work on `localhost` **and**
on a deployed URL, but they are rate-limited, have a user cap, and show Clerk's
development banner. That's risky with a room full of students.

A **production instance** requires a **custom domain** — Clerk needs DNS records
(a `CNAME` on `clerk.yourdomain.com`), which you **cannot** add to a `*.vercel.app` URL.

So:

- **You have a domain** → create a production instance, add the DNS records Clerk shows
  you, point Vercel at the domain, and use the `pk_live_` / `sk_live_` keys. This is the
  correct setup for the event.
- **You only have `*.vercel.app`** → you'll be running on development keys. Fine for
  testing and a small event; know the limits before event day.

`npm run preflight` tells you which set you're on, and catches the classic mistake of
mixing a `pk_test_` with an `sk_live_`.

---

## 4 · Run it locally

Create `.env.local` in the project root (copy [`.env.example`](./.env.example)):

```bash
# Supabase — Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-secret

# Admin — gates /admin and every /api/admin/* route
ADMIN_PASSWORD=change-me-to-something-strong

# Clerk — Dashboard → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

`.env.local` is git-ignored — **never commit it**, especially with a public repo.

```bash
npm run preflight   # verify config + database before you start
npm run dev         # http://localhost:3000
```

---

## 5 · Deploy to Vercel

1. Push this repo to GitHub.
2. https://vercel.com/new → **Import Git Repository** → pick `innovate-to-escape-v2`.
3. Framework preset auto-detects **Next.js**. Leave the build settings alone.
4. Expand **Environment Variables** and add all **8**:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service role key |
   | `ADMIN_PASSWORD` | your admin password |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
   | `CLERK_SECRET_KEY` | Clerk secret key |
   | `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
   | `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |

   > Missing env vars are the #1 cause of a failed first deploy. All 8, no typos.

5. **Deploy**. Live in ~60 seconds.
6. In Clerk → **Domains**, add your deployed URL so Clerk accepts requests from it.

**Changing an env var later?** Vercel only picks it up on a new build:
**Deployments → ⋯ → Redeploy**.

---

## 6 · Verify everything works

```bash
npm run preflight
```

Checks, without ever printing a secret:

- all required env vars present
- Clerk publishable/secret keys match (both test or both live)
- Clerk secret key actually authenticates against Clerk's API
- Supabase reachable and `game_config` seeded
- **every column v2 needs exists** — this is what catches a migration you forgot
- word list and Phase 2 metadata configured
- no leftover duplicate open attempts

Then click through it in a browser:

| # | Do this | Expect |
|---|---|---|
| 1 | Visit `/leaderboard` signed out | Loads — it's public |
| 2 | Click **Play** signed out | Redirected to sign-in |
| 3 | Sign up | Avatar + **My games** appear in the header |
| 4 | `/play` → enter roll number → **Start game** | Board appears, name prefilled |
| 5 | Press **Enter twice fast** on one guess | Exactly one row — no lost or doubled guess |
| 6 | Close the tab, reopen `/play` | Board restored with your guesses |
| 7 | Solve it, type Phase 2 words | "Draft saved ✓" |
| 8 | Close the browser, return to `/play` | Draft still there and still editable |
| 9 | **Submit final answer** | Confirm step → score → locked |
| 10 | Open `/my-attempts` | Your game, guess grid, scores, rank |
| 11 | Sign out, sign up as someone else, **same roll number** | Rejected — no takeover |

---

## 7 · Configure the game

Open `/admin` on your deployed site and enter `ADMIN_PASSWORD`.

1. **Word list** — paste 5-letter words separated by commas or new lines. The counter
   shows how many valid words the parser found before you save.
2. **Phase 2 metadata** — JSON, one entry per word:

   ```json
   {
     "CLOUD": {
       "url": "https://en.wikipedia.org/wiki/Cloud",
       "target_words": ["vapor", "atmosphere", "condensation", "cirrus"],
       "target_sentence": "A cloud forms when vapor condenses in the atmosphere"
     }
   }
   ```

   URLs are validated server-side — only `https://` on Wikipedia is accepted; anything
   else is replaced with a safe auto-generated URL. Words with no entry get an
   auto-generated Wikipedia URL and zero target words.
3. **Mode** — `classic` (untimed), `timed` (server-enforced deadline), or `tournament`.
4. **Game OPEN/CLOSED** — closing freezes *new* registrations. Players already mid-game
   keep playing and can still finish Phase 2.

### Scoring

Both phases max out at **100**, so a perfect total is **200**.

| Wordle | Points |
|---|---|
| Solving | 40 |
| Guess efficiency | 0–30 (fewer guesses = more) |
| Speed | 0–30 (`30 − seconds/10`) |

| Phase 2 | Points |
|---|---|
| Each target word identified | 5 |
| Sentence contains ≥3 target words | +20 |
| Sentence exactly matches `target_sentence` | +40 |

---

## 8 · Running the event

- Share the deployed URL.
- Project `/leaderboard` on a screen — it refreshes every 3s and needs no login.
- Keep `/admin` open on your laptop.
- Players can close their browser and come back — nothing is lost.
- Afterwards: **Export CSV** in `/admin` for every attempt with a full breakdown.

---

## 9 · Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `column ... does not exist` | Migration not run | Run `supabase/migration-multiuser.sql`, then `npm run preflight` |
| Every page redirects to sign-in | Clerk keys missing on Vercel | Add all 4 Clerk vars, then **Redeploy** |
| Sign-in loops or won't load | Deployed domain not registered with Clerk | Clerk → **Domains** → add your URL |
| `Config missing` | `game_config` row absent | Re-run `schema.sql` |
| `No words configured` | Empty word list | Add words in `/admin` |
| Leaderboard empty | Nobody has *finished* a game | Only finished attempts appear |
| A player is locked out of a retry | One attempt per player | Delete their attempt in `/admin` |
| Env var change had no effect | Vercel caches builds | **Deployments → ⋯ → Redeploy** |

---

## 10 · Project layout

```
middleware.ts               Clerk route protection (public by default)
scripts/preflight.mjs       pre-event config + database verification
app/
├─ page.tsx                 landing hero
├─ play/page.tsx            registration + board + Phase 2 panel
├─ my-attempts/page.tsx     the player's own games and results
├─ leaderboard/page.tsx     live ranked list (auto-refresh 3s)
├─ admin/page.tsx           password-gated console
├─ sign-in/, sign-up/       Clerk auth pages
└─ api/
   ├─ session/              POST start-or-resume · GET resume by attempt_id
   ├─ guess/                POST evaluate a guess (compare-and-swap)
   ├─ leaderboard/          GET best attempt per player
   ├─ my-attempts/          GET the caller's own history
   ├─ phase2/
   │  ├─ config/            GET wiki URL + target count (never the words) + draft
   │  ├─ draft/             POST autosave — never scored
   │  └─ submit/            POST FINAL submission — scores and locks
   └─ admin/                login · config · attempts · phase2-review · export
lib/
├─ supabase.ts              server-only admin client
├─ identity.ts              Clerk account ↔ player row, ownership checks
├─ attempt.ts               loading, deadline enforcement, safe client state
├─ leaderboard.ts           ranking + per-player dedupe
├─ wordlist.ts              guess validation + scoring + evaluator
├─ words-data.ts            ~3000 five-letter words for guess validation
├─ phase2.ts                URL validation, normalization, scoring, validators
└─ adminAuth.ts             constant-time password compare
supabase/
├─ schema.sql               full schema — use this for a NEW project
├─ migration-phase2.sql     upgrade an old DB to Phase 2
└─ migration-multiuser.sql  upgrade an old DB to v2
```

---

## 11 · Security notes

- `SUPABASE_SERVICE_ROLE_KEY` and `CLERK_SECRET_KEY` are server-only. They must never
  appear in a `NEXT_PUBLIC_*` variable, in client code, or in a commit.
- Row-level security is on for all tables; only server routes (service role) touch them.
- Answers live server-side and are revealed only when a game ends — including on
  `/my-attempts`, which withholds the word for a game still in progress.
- Every game route verifies the attempt belongs to the signed-in account, so knowing
  someone's `attempt_id` is not enough to play as them.
- `/admin` uses a constant-time password compare and is deliberately **not** behind
  Clerk — organisers don't need a player account.
- Wikipedia URLs from the admin console are host-validated to prevent `javascript:` and
  phishing URLs reaching an anchor tag.

---

## 12 · Environment variables

| Name | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | Safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | **Never expose or commit** |
| `ADMIN_PASSWORD` | **server only** | Make it strong |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | client + server | Safe to expose |
| `CLERK_SECRET_KEY` | **server only** | **Never expose or commit** |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | client | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | client | `/sign-up` |

---

Built for the **Prodinno Club** · *Innovate To Escape*
