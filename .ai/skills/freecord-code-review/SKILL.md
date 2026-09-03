---
name: freecord-code-review
description: Review a Freecord change against the five pillars this codebase actually breaks on — edge parity, self-healing rooms, peer content, localized copy, honest evidence — then fix what was confirmed and close with a standard report. Use when reviewing or cleaning up a diff, a branch, a pull request, or your own work before a commit window; do not use for production incident triage, and do not let it widen into refactoring beyond the findings.
---

# Review and fix a Freecord change

Judge a diff by the failures this system really has, repair the ones you can
prove, and say plainly what happened to each. Freecord is a P2P mesh with two
server edges over one core, no accounts, and a shared worktree — so a review
that only reads for style misses everything that has actually cost this project
a release.

Review and fix are one job here, but not one motion: find everything, then
repair. The order is the whole discipline.

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

### 3. Peer content: checked on the way in, kept nowhere

One boundary, two directions. The room link is the credential and there are no
accounts, so **everyone in a room is an untrusted input source** — and
everything they send is content this product promises never to keep.

Checked on the way in:

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

Kept nowhere. Chat is ephemeral and sealed, files go peer to peer and never
through a server, and the storage of zero content is a product promise, not an
implementation detail (`.ai/rules.md`). **No automation checks this.** A green
suite and all four other pillars pass over a retention leak without noticing:

- Does the diff log, persist, or forward message text, a file name, a
  participant name, or a tool's state? A `console.log` left in from debugging
  ships to every user's console and is the most common form of this.
- Does anything new land in Durable Object storage, `localStorage`, or an
  error report that carries room content rather than room *shape*? Counts,
  durations and ids are shape; what somebody typed is content.
- Does an error path widen what a thrown object carries — a message body
  attached to an exception, then logged upstream?
- If the change adds telemetry or a HUD reading, does it measure the room
  without quoting it?

### 4. Nothing a human reads is hardcoded

Shipping locales are `en-US` (source of truth), `pt-BR`, `es`, `zh-CN`, `ja`.

Read for what the test cannot see. `web/test/i18n.test.ts` already asserts key
parity across all five catalogs, so a missing key is CI's job, not yours. What
CI is blind to is the string that **never became a key**:

- Is every new user-visible string routed through i18n at all? A literal left
  in JSX creates no key, so parity stays green and the copy ships in English to
  everyone. This is the finding automation structurally cannot make.
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
- In this shared tree the lie is worse than "yesterday's bundle". Whoever last
  ran a build compiled **whatever was in the worktree at that moment**,
  including other sessions' uncommitted work — so the bundle can contain code
  that is in no commit, on no branch, and in nobody's review. Observed: a
  `web/dist` carrying a peer's `jbuf` HUD strings hours before that work was
  committed and while it was still absent from `origin/main`. Rebuild, or you
  are grading someone else's unreviewed code and calling it your change.
- **Make one assertion that only your change can satisfy.** A green run proves
  nothing about *which* bundle it ran against unless something in it exists
  only in your diff — a new test id, a class, a string. Anchor one assertion
  there and the pass becomes evidence of the bundle, not just of the feature.
  This is the cheapest defence against the trap above, and it works even when
  you forgot to rebuild.
- `E2E_BUILD_WEB=1` runs the web build, which is `tsc --noEmit && vite build`.
  So **anyone's** red typecheck in the shared tree aborts your rebuild, and the
  tempting escape — dropping the flag — puts you straight back into testing a
  bundle you did not make. Confirm the red is not in your own change, then
  rebuild with `npx vite build` from `web/`, which skips the typecheck without
  giving up the fresh bundle.
- A change to the DO alarm, the screen slots, or resume also needs
  `npm run check:worker --workspace e2e` against `wrangler dev`.
- Does the evidence offered actually exercise the changed boundary, or a
  neighbouring one that was already passing? Coverage of the wrong seam is the
  most expensive kind of green.
- Numbers, not adjectives: counts passed/failed/skipped, and what stayed
  unproved. "Tests pass" is not a review artifact.
- **Arithmetic about cost is a hypothesis, not evidence.** A calculation of
  memory or bandwidth picks a term and multiplies it, and the term is chosen
  by whoever is worried — which is how three reviewers can agree on a number
  and all be measuring the part that does not matter. Reviewing v0.11.0 we
  estimated chat memory from message size three times, refining each other's
  figures; the measurement showed retained text costs 0.7 MiB while the
  highlight parser costs 3.6 MiB the first time a block renders, and per
  block the cost does not vary with the block's size at all. Ask for a
  measured number before accepting a size argument in either direction, and
  put a control in it — two runs that differ only in the quantity you claim
  is responsible.
- Beware a metric that looks quantised: `performance.memory` returned an
  identical figure for three different scenarios in that session, which reads
  as precision and is the opposite. Cross-check with a second instrument
  before it reaches a report.

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

This skill reviews **and fixes**. The two halves are sequential, never
interleaved: find everything first, then repair. A reviewer who starts editing
at the first finding stops reading, and the finding that mattered was in the
file they never got to.

### Phase 1 — review

1. Get the diff and the branch point. Never review from a dirty shared tree
   without separating your own uncommitted work from the change under review.
2. Read the changed functions in full, plus the callers the diff implies.
3. Walk the five pillars in order, noting findings as you go with `file:line`.
4. For each candidate finding, construct the concrete failure: the input,
   state, or sequence that produces the wrong result. A finding you cannot make
   fail is a hypothesis — label it as one or drop it.
5. Verify what you can cheaply verify. Run the focused test, grep for the other
   edge, open every sweep hit. Reviews that assert without checking are how a
   wrong claim reaches a commit window.
6. Rank by consequence. Only now start fixing.

### Phase 2 — fix

Repair what you confirmed, in the change under review, and prove it.

7. **Fix only confirmed findings.** A hypothesis does not earn an edit. If
   step 4 could not produce the failing case, it goes in the report as a
   question, not into the code.
8. **Stay inside the diff's own files.** A real defect in a file this change
   does not touch is reported, never fixed — in this tree it is likely another
   session's work in progress, and `.ai/rules.md` forbids touching it. Same for
   any file a peer has announced.
9. **One finding, one edit.** If the repair grows into a redesign, a signature
   change, or a rename that ripples, stop and report it as needing a decision.
   Scope creep inside a review is unreviewable by definition.
10. **Re-run the evidence after fixing.** Pillar 5 applies to your own repair:
    typecheck, the tests the fix touches, and the browser project against a
    fresh build if the fix reached the UI. A fix is an unreviewed change until
    it has been run.
11. **Leave the tree honest.** Fixes stay uncommitted unless the user asked for
    a commit; if they did, the commit window in `.ai/rules.md` applies in full —
    explicit paths, `git show --stat` verified, nothing of a peer's swept in.
12. Report every finding with what actually happened to it.

## Report

**Every run of this skill ends with the template below in chat** — findings or
none, fixes applied or not, review abandoned halfway. Same shape every time, so
two reviews can be compared at a glance and nobody has to reread the
conversation to learn what changed on disk.

Three rules give it its value:

1. **Every finding carries its outcome.** `fixed`, `reported` (out of the
   diff's files, or needs a decision), or `unproved` (could not make it fail).
   A finding list without outcomes leaves the reader to diff the tree to find
   out what you did.
2. **The pillar walk is reported even when empty.** "Pillars 1, 3 clean" is
   information; silence reads as "not checked" and is indistinguishable from it.
3. **Never claim a check you did not run.** If the browser project did not run
   against the fix, say so — `não rodado` is a fact, a green tick you did not
   earn is a lie with a checkmark on it.

### Template

````markdown
**Review de <alvo>** — <N> achados · <N> corrigidos · <N> reportados

**Corrigidos** (verificados e reparados neste tree)
- `path/file.ts:120` · pilar 2 — <defeito em uma linha>.
  Falha quando: <entrada/estado → resultado errado>.
  Correção: <o que mudou, em uma linha>.

**Reportados, não corrigidos** (fora dos arquivos do diff, ou exige decisão)
- `path/other.ts:44` · pilar 3 — <defeito>. Motivo de não corrigir: <qual>.

**Não comprovados** (hipótese, sem caso de falha construído)
- `path/third.ts:12` · pilar 1 — <suspeita>. O que confirmaria: <qual teste>.

| pilar | resultado |
|---|---|
| 1 · both edges | <limpo / N achados / fora de escopo neste diff> |
| 2 · self-healing | <…> |
| 3 · peer content | <…> |
| 4 · copy | <…> |
| 5 · evidence | <…> |

**Evidência depois das correções**
- typecheck: <resultado> · testes tocados: <N passed> · browser em build fresco: <resultado ou "não rodado: <motivo>">

**Estado do tree** — <arquivos alterados, não commitados / commitado em <sha>>
**Não examinado** — <o que ficou de fora, e por quê>
````

Rank by consequence, not by how easy the fix is. A missing Worker edge outranks
every naming preference in the diff. If the change is clean, say so in one line
and stop — manufacturing nits to look thorough trains people to ignore reviews.

When the review is abandoned partway, keep the template and say in the first
line where it stopped and why, which pillars were reached, and whether any fix
was already applied to the tree. A half-review that leaves edited files behind
without saying so is worse than no review.

## Boundaries

- **Fixing is authorized; widening is not.** The mandate is the findings you
  confirmed inside the files the change under review already touches. It is not
  a licence to refactor, rename, restyle, or improve code you happened to read
  on the way.
- Never "fix" a red typecheck in a file the diff does not own — in this shared
  tree it is probably another session's work in progress, and repairing it can
  erase work that was mid-edit.
- Do not weaken an assertion, add a retry, or extend a timeout to make a
  reviewed change pass. Diagnose the boundary instead.
- Judge the change in front of you. A pre-existing problem the diff merely sits
  near is a separate finding at most, never a reason to block.
- Reviewing does not authorize a commit, a push, or a deployment. Follow the
  commit window in [`.ai/rules.md`](../../rules.md) for anything you own.
