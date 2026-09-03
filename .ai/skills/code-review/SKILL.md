---
name: code-review
description: Review a Freecord change against the five pillars that this codebase actually breaks on — edge parity, self-healing rooms, untrusted input, localized copy, and honest evidence. Use when reviewing a diff, a branch, a pull request, or your own work before a commit window; do not use for production incident triage or as authorization to fix what you find.
---

# Review a Freecord change

Judge a diff by the failures this system really has. Freecord is a P2P mesh
with two server edges over one core, no accounts, and a shared worktree — so a
review that only reads for style misses everything that has actually cost this
project a release.

## Required context

Read [`.ai/rules.md`](../../rules.md) completely first: it holds the
architecture invariants the pillars below enforce, and the shared-worktree
protocol that governs what you may touch.

Establish the exact diff before forming any opinion. Review what changed, not
what the file looks like now:

```bash
git diff main...HEAD           # a branch
git diff --cached              # a staged commit window
gh pr diff <n>                 # a pull request
```

Read the full body of every function the diff touches, not only the changed
lines. A correct-looking hunk inside a function that returns early above it is
the shape of the React #310 bug this repo has already shipped once.

## The five pillars

Walk all five, in order. Each one names a failure this codebase has produced or
is one edit away from producing.

### 1. Both edges, one core

`server/` (Fastify) and `worker/` (Durable Objects) are two skins over
`server/src/domain/` and `server/src/app/`. **The Worker is production.**

- Does a new route or protocol message exist in **both** edges? One edge only
  means "works in dev, missing in production".
- Is the decision logic in `domain/`, where one test covers both edges, rather
  than duplicated into two transports that will drift?
- Does the diff rename a wire value — screen-share quality (`sharp`,
  `balanced`, `smooth`), a message type, a `ROOM_LIMITS` field? Those are
  protocol. Renaming one is a coordinated change across `server/`, `worker/`
  and `web/` in a single deploy, never a drive-by cleanup.
- If only one edge changed, make the author say why. "I'll do the Worker next"
  is a production outage with a delay on it.

### 2. The room heals itself

Every timing constant here exists because something once did not recover.
`ROOM_LIMITS` in `server/src/domain/room.ts`: `peerTimeoutMs` 35 s,
`heartbeatIntervalMs` 10 s, `screenLockGraceMs` 10 s, `emptyTimeoutMs` 15 min.

- **The Durable Object runs every sweep on one alarm.** A join or resume may
  move that alarm *earlier*, never later. Setting it outright once postponed a
  dropped sharer's slot release indefinitely. Any new `setAlarm` on a hot path
  is a finding until proven to only ever advance it.
- Are signals addressed to a peer inside its grace **held, not dropped** — on
  both edges? Dropping them turns a reconnect into a dead tile.
- Can a reconnecting peer rebuild this state from `welcome`? State that only
  exists in a live client's memory does not survive the resume it will get.
- Does anything hold a seat or a screen slot on a *dropped* connection rather
  than releasing it on the grace? That is how ghosts keep rooms alive forever.
- A frozen tile must heal without F5. If the change can leave a negotiation
  open or an ICE path dead, the watchdog in `web/src/lib/mesh.ts` has to be
  able to see it.

### 3. Untrusted until parsed

The room link is the credential and there are no accounts, so **everyone in a
room is an untrusted input source**, including the peer that sent you a tool
state, a chat message, or a file.

- `parseState` is a security boundary, not a formality — the server carries one
  opaque JSON value per tool id and *cannot* validate what it does not
  understand (`server/src/domain/tools.ts`, `docs/tools.md`). Every tool checks
  its own state on arrival.
- Does new parsing reject unexpected shapes, bound strings, cap collections,
  and clamp numbers? Is hostile input actually tested, not just the happy shape?
- Is the state within `TOOL_LIMITS.maxStateBytes` (4 KiB per tool)?
- Does the UI reconstruct from state rather than assuming a component stayed
  mounted? A peer can deliver any state at any time.
- Does anything leak room internals — the mesh, media tracks, the chat key — to
  a tool that should only see its own value?

### 4. Nothing a human reads is hardcoded

Shipping locales are `en-US` (source of truth), `pt-BR`, `es`, `zh-CN`, `ja`.

- Every user-visible string goes through i18n, in **all five** catalogs. A key
  present in one is a string that ships blank elsewhere; a key removed from one
  fails `web/test/i18n.test.ts`, which the browser suite will not catch.
- Some keys pick a **random variant per page load** (`web/src/i18n/messages.ts`).
  Never write a test — or a selector — that matches their text. Anchor on role,
  test id, or a stable accessible name.
- Copy may carry humor, but never in an accessible name, an instruction, or
  anything about privacy. Those must read the same every time.
- Code, comments, commit messages and test names are **English**. If the diff
  touches a file with Portuguese comments left over from the conversion,
  translate what it touches — do not leave a half-translated paragraph.

### 5. Green means it ran

A passing suite is a claim about a build. Verify which one.

- A UI change is not green until the browser project ran against a **fresh**
  build: `E2E_BUILD_WEB=1 npm run test:browser --workspace e2e`. A stale
  `web/dist` makes a passing suite lie about what it tested.
- A change to the DO alarm, the screen slots, or resume also needs
  `npm run check:worker --workspace e2e` against `wrangler dev`.
- Does the evidence offered actually exercise the changed boundary, or a
  neighbouring one that was already passing? Coverage of the wrong seam is the
  most expensive kind of green.
- Numbers, not adjectives: counts passed/failed/skipped, and what stayed
  unproved. "Tests pass" is not a review artifact.

### Mechanical sweep

Cheap first pass that tells you which pillars are even in play. Run it against
the range under review, then read what it returns:

```bash
R=main...HEAD
git diff --name-only $R | grep -E '^(server|worker)/'   # pillar 1 in play?
git diff $R | grep -E '^\+' | grep -E 'setAlarm|GraceMs|TimeoutMs'
git diff $R | grep -E '^\+' | grep -E 'parseState|JSON\.parse'
git diff --name-only $R | grep -c 'i18n/locales/'       # expect 0 or 5, never 1–4
```

**A hit is a lead, not a finding.** These patterns over-match: a sweep for i18n
call sites will happily return every `it('...')` in a test file. Open each hit
and confirm it before it reaches your report — a review that promotes greps to
findings is worse than no review, because it is confidently wrong.

## Working method

1. Get the diff and the branch point. Never review from a dirty shared tree
   without separating your own uncommitted work from the change under review.
2. Read the changed functions in full, plus the callers the diff implies.
3. Walk the five pillars in order, noting findings as you go with `file:line`.
4. For each candidate finding, construct the concrete failure: the input,
   state, or sequence that produces the wrong result. A finding you cannot make
   fail is a hypothesis — label it as one or drop it.
5. Verify what you can cheaply verify. Run the focused test, grep for the other
   edge, check the key exists in all five catalogs. Reviews that assert without
   checking are how a wrong claim reaches a commit window.
6. Report, ranked by severity, and say plainly what you did not examine.

## Report

Lead with the verdict, then findings, most severe first:

```markdown
**Review of <target>** — <N> findings (<N> blocking)

**Blocking**
- `path/to/file.ts:120` · pillar 2 — <one-line defect>.
  Fails when: <concrete input/state → wrong result>.

**Worth fixing**
- `path/to/other.ts:44` · pillar 4 — <one-line defect>.

**Considered and clean** — <pillars walked with nothing found>
**Not examined** — <what you did not look at, and why>
```

Rank by consequence, not by how easy the fix is. A missing Worker edge outranks
every naming preference in the diff. If the change is clean, say so in one line
and stop — manufacturing nits to look thorough trains people to ignore reviews.

## Boundaries

- **A review is read-only.** Reporting a finding does not authorize fixing it.
  Fix only what the user also asked you to fix, and never in the same breath as
  a review the user has not read yet.
- Never "fix" a red typecheck in a file the diff does not own — in this shared
  tree it is probably another session's work in progress.
- Do not weaken an assertion, add a retry, or extend a timeout to make a
  reviewed change pass. Diagnose the boundary instead.
- Judge the change in front of you. A pre-existing problem the diff merely sits
  near is a separate finding at most, never a reason to block.
- Reviewing does not authorize a commit, a push, or a deployment. Follow the
  commit window in [`.ai/rules.md`](../../rules.md) for anything you own.
