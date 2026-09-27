# Blackout at Altitude — P2P edition

True peer-to-peer. The host's device holds all game state and relays every
move between players over direct WebRTC data channels. The only external
service involved is PeerJS's free public broker, which handles nothing but
the initial "who is who" handshake — no game data, no rankings, no scores
ever touch it. I haven't run `npm install` / `next build` myself (no network
access in the environment I wrote this in), so treat it as a strong first
draft and send me the exact error if something breaks on your first build.

## Flow reorder and small fixes
- **Team setup now happens right after the scenario is picked**, before the
  briefing — not after individual ranking like the first version. Flow is
  now: pick scenario → set up teams → briefing → rank alone → team ranking
  (using the teams already assigned) → reveal. This means players know
  their team before they've even read the brief.
- **"Facilitator mode"** replaces the old "Facilitate only (don't play)"
  toggle — same function, clearer label, with a one-line explanation shown
  underneath at all times (not just when it's on).
- **Team names are phonetic only now** (Alpha, Bravo, Charlie...) — the
  "Team A/B/C" option was removed rather than kept as a second choice.
- **"Lost at Sea"** is the new name for the sailboat-capsize scenario
  (previously "Adrift After the Regatta"). Worth knowing: this is still our
  own original item list and expert reasoning, not the well-known classic
  Lost at Sea exercise's specific content — we're using the name, not
  reproducing that published material.

## Multiple teams
- After individual ranking, the host now goes through a **team setup step**
  instead of straight into one shared team ranking. Set a target team size
  (the number of teams is derived from player count ÷ size), pick a naming
  style (Alpha/Bravo/Charlie or Team A/B/C), then choose how players get
  sorted:
  - **Auto-assign** — shuffles participants into teams of the target size.
  - **Manual** — host assigns each player to a team one at a time.
  - **Let players choose** — each player picks their own team from a live
    list showing current counts per team.
- **Each team ranks independently.** Team phase is no longer one shared
  list — every player only sees and edits their own team's ranking, synced
  only to their own teammates. A facilitator-only host instead sees every
  team's live ranking at once, across the whole room.
- **Reveal is per-team**, with a tab strip to switch between teams if there's
  more than one. Everyone defaults to viewing their own team first. Each
  team gets its own synergy score, comparison table, radar chart, bias
  flags, and expert-reasoning breakdown — nothing is pooled or averaged
  across teams, since that would hide real differences between how each
  group performed.
- Session history saves one row per team per round, so multi-team sessions
  show up as separate entries you can compare.
- With only one team (team size ≥ player count, or you just don't split
  people up), everything behaves exactly like before — the tab strip
  doesn't even appear with a single team.

## Facilitator-only host mode
- Toggle in the lobby: "Facilitate only (don't play)." When on, the host
  runs the session — picks the scenario, controls the timer, advances
  phases, watches the live facilitator view — but never submits an
  individual ranking and isn't counted in the scoring or the synergy
  calculation. This works naturally because scoring was already built to
  only count whoever actually submits a ranking; facilitator mode just
  skips the host's own submission step entirely and shows them a dedicated
  dashboard instead of a ranking screen.
- Minimum players to start is 3 in this mode (host plus at least 2 real
  participants), versus 2 normally, since the whole point of the game is
  comparing individual and team decisions — that needs a real team.
- The player list shows "(facilitating)" instead of "(host)" so everyone in
  the room knows the host isn't a scored participant this round.

## Reasoning text and comparison table
- **Every item in all 30 scenarios (384 items total) now has a one-sentence
  reasoning** explaining why the expert ranked it where it did
  (`lib/scenarios.ts`, `itemReasoning()`). On the reveal screen, tapping any
  row in the "Team ranking vs. expert order" list slides down that
  reasoning — no page navigation, just an inline expand.
- **A full comparison table** ("Full comparison" on the reveal screen) shows
  every item's position under Expert, Team, and — behind the same "Show
  individual players" toggle the radar chart already uses — every player's
  own position, color-coded the same red/amber/green scale as the rest of
  the reveal screen. Wide on purpose with more than a couple of players; it
  scrolls horizontally rather than trying to compress to fit.
- Facilitator-only host mode (host administers without being scored) was
  discussed but intentionally not built this round — deferred per your call.

## Why this is simpler to deploy than the last version
No environment variables. No database. No serverless functions. This is a
plain static export — `next.config.js` sets `output: "export"`, so
`npm run build` produces a folder of static HTML/JS/CSS in `out/`. Netlify's
job is just to serve those files; it never runs a server for this app. That
also means the "missing env var breaks the build" class of problem from the
Supabase version can't happen here — there's nothing to configure.

## Deploy to Netlify
1. Push this folder to a GitHub repo.
2. In Netlify: "Add new site" → import the repo. It should auto-detect the
   settings from `netlify.toml` (`npm run build`, publish `out`). If it
   doesn't, set those manually.
3. Deploy. No environment variables needed.

## How the code/link system works
- **Host** taps "Host a game," gets a 6-character room code (e.g. `K7XPQ2`)
  and a shareable link containing that code as `?code=K7XPQ2`.
- **Joining by code**: a player opens the site directly and types the code in.
- **Joining by link**: tapping the link opens the site with the code
  pre-filled and skips straight to a "you're invited, enter your name" screen.
- Under the hood, the host's PeerJS peer ID is `boa-` + the code. Joining
  calls `peer.connect("boa-" + code)`. PeerJS's public broker (a free,
  shared service — not something this project hosts) helps the two browsers
  find each other and negotiate the WebRTC connection. After that,
  everything flows peer-to-peer.

## Real limitations, stated plainly
- **The host device is the server.** If the host closes the tab, backgrounds
  the browser for too long, or loses their network, the game ends for
  everyone — there's no backup copy of the game state anywhere else.
- **Best on the same WiFi.** There's a public STUN server configured
  (bundled into PeerJS's defaults) for NAT traversal, but no TURN relay.
  Most home/office WiFi will connect fine; strict cellular carrier NATs
  occasionally can't establish a direct path.
- **Room codes live in a shared public namespace.** The `boa-` prefix makes
  collisions with unrelated PeerJS apps very unlikely, but not
  mathematically impossible. The code already retries automatically if a
  collision happens.
- **No accounts, no history.** Closing the tab loses everything. That's
  intentional for this stage — it's a working proof of the P2P mechanics,
  not a finished product.

## Timer, voting, browsing, and ending screen
- **Round timer.** Host sets minutes per phase in the lobby (0 = off). Both
  individual and team phases show a shared countdown, computed from a
  synced end-time the host broadcasts, not a locally-started clock, so
  everyone's countdown agrees. When it hits zero the phase doesn't advance
  on its own — the host gets an "advance whenever you want" note, and
  players get a "Vote to move on" button. Once more than half of connected
  players have voted, the host auto-advances the same way the host's own
  buttons already do.
- **Peers can browse the scenario library while waiting.** Business/Survival
  tabs with expandable one-line briefs, shown to a joined player before the
  host has picked anything. Custom scenarios aren't browsable this way —
  they live only on the host's device until actually picked and sent over
  the data channel, so there's nothing to preview beforehand.
- **"End session"** on the reveal screen (separate from "Change scenario")
  broadcasts a close-out message and shows everyone a proper ending screen
  with the final synergy score, distinct from just cycling to a new round.
- **Per-player radar lines.** "Show individual players" toggle on the reveal
  screen adds every player's own style profile to the radar, color-coded,
  alongside team and expert — off by default so a full room's chart doesn't
  start out cluttered.

## Phase 3 additions (device-local, not a real backend)
Same zero-server architecture as before — these are all built without a
database, so each one is the closest honest version of the original ask:

- **"Accounts" / trend lines** — session history saves to the *host's own
  browser* via `localStorage` (`lib/sessionHistory.ts`), shown under "View my
  session history" on the home screen. This is not a real login and does not
  sync across devices. If two different people host from two different
  laptops, they get two separate histories. A real account system needs a
  database, which this build intentionally doesn't have.
- **Facilitator mode** — during the individual ranking phase, the host can
  expand "Show live rankings" to see each player's full ranking the moment
  they submit it. This updates per-submission, not per-keystroke — watching
  someone drag items in real time would mean broadcasting every single move
  instead of just the final ranking, a much chattier protocol. Flag this if
  you want true live-drag visibility later; it's a bigger change.
- **PDF export** — "Download PDF summary" on the reveal screen, built with
  `jspdf`, entirely client-side. Includes scores, synergy, the team-vs-expert
  delta list, and bias flags as text. The radar chart itself isn't embedded
  as an image — rendering an SVG chart into a PDF reliably is more fragile
  than laying out text, so this trades that visual off for something that
  won't break.
- **Custom scenario builder** — host-only, from the "Custom" tab in the
  scenario picker. Add items in the order you want them ranked best-to-worst
  (that order becomes the expert answer), optionally tune each item's five
  dimension weights. Saved to the host's `localStorage`
  (`lib/customScenarios.ts`). When picked, the entire scenario object is sent
  to every connected player over the data channel — peers never need the
  scenario pre-installed, which is what makes this work without a database.

## Latest round of changes
- **Full narrative briefing.** Each scenario now has a `briefing` passage
  (several sentences of scene-setting and stakes) shown alongside a clear
  "What you have" inventory list, before ranking starts.
- **Change scenario from the reveal screen.** The host gets a "Change
  scenario" button after results. It resets game state and sends everyone
  back to the scenario picker without touching the underlying WebRTC
  connections — nobody re-enters the room code or link. Explicitly did not
  build the Phase 3 (accounts, facilitator mode, PDF export, custom scenario
  builder) or Phase 4 (paid tiers, Slack integration, analytics dashboard)
  items from the original build guide — those are still just on the roadmap,
  not built.

- **All 10 scenarios** from the concept library are wired in (`lib/scenarios.ts`),
  five business and five survival, each with real per-item dimension weights
  and an expert-ranked order. The host picks one in the lobby before players
  can start.
- **A briefing step** now sits between the lobby and individual ranking —
  everyone reads the scenario setup and the game's unique mechanic before
  ranking starts, and the host controls when to move on.
- **Style radar chart** (via `recharts`) on the reveal screen compares the
  team's weighted priorities against the expert's across five dimensions:
  speed & decisiveness, immediate stabilization, resourcefulness, long-term
  strategy, and risk awareness (`lib/insights.ts`, `styleProfile()`).
- **Pattern-level bias flags** — generic, scenario-agnostic checks for early
  anchoring, availability bias (overweighting familiar/tool-like items),
  under-weighting strategy, and under-weighting risk. These compare the
  team's and expert's style profiles rather than hardcoding rules per game,
  so they work across all 10 scenarios automatically.
- **Color-coded delta list** on the reveal screen — green for a near-exact
  match with the expert order, amber for a moderate miss, red for a big one.

## What Phase 2 doesn't include yet
- Dimension weights were assigned by hand, quickly, based on each item's
  obvious role in its scenario — treat them as a reasonable first pass, not
  a rigorously validated model. Tightening them (or letting you edit them)
  is a natural next step.
- Dual-expert scoring (mentioned in a few scenarios' `mechanicDesc`, like the
  activist siege's two schools of thought) isn't implemented — those
  currently score against one blended expert order.
- No accounts or saved history across sessions — same as Phase 1.


