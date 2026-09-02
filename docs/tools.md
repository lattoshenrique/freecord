# Writing a tool

A **tool** is something a room brings in besides the people in it: a video
everyone watches, a board everyone draws on, a timer everyone can see. The
dock has a shelf for them, and this document is how you put one there.

The short version: a tool is a folder that exports one object. It gets one
shared value it can read and write for the whole room, and everything else
it needs arrives as props. **It needs no protocol change** — the edges
already carry every tool that will ever exist — and most tools need no
server code either (see "When a tool needs the app").

```
web/src/tools/
  contract.ts        the types below, checked by the compiler
  registry.ts        the tools this build ships — one line each
  youtube/           the first tool, and the worked example
  video/             the second, and the example of needing a route
```

## The contract

```ts
export interface ToolDefinition<S> {
  id: string;                                  // 'acme-whiteboard'
  Icon: ComponentType;                         // 24×24, currentColor
  text: ToolText;                              // your strings, by locale
  parseState: (raw: unknown) => S | null;      // your state, checked
  Shelf: ComponentType<ToolShelfProps<S>>;     // your panel in the shelf
  Stage?: ComponentType<ToolViewProps<S>>;     // what you put on stage
}
```

Both views are handed the same props:

| prop | what it is |
| --- | --- |
| `state` | the room's state for your tool, already through your `parseState`; `null` while the tool is off |
| `setState(next)` | says what the state is, **for everybody**; `null` turns the tool off for the room |
| `at` | local clock (ms) when that state was set, with the time it spent in flight already paid |
| `mine` / `by` | whether this client set it, and which peer did |
| `self` / `peers` | who is in the room |
| `speakerOn` | the room's speakers are on; if your tool makes sound, respect it |
| `t(key, vars?)` | your own strings, in the viewer's language |
| `dismiss()` | (shelf only) close the shelf |

## The two rules that make it work

**1. Last word wins.** There is no host and no lock. Whoever touches a tool
says what its state is, and everybody — the sender included — works from
what comes back from the server. Nothing is applied locally first, so
nobody can drift into a private idea of what is going on.

**2. The clock is the server's.** A state is stored with the reading of the
server's clock that produced it, and reaches you as an **age**. The room
hook subtracts that age, so `at` is "when this was set" on *your* machine's
clock. A tool that keeps time counts from `at` and never compares one
browser's clock to another's:

```ts
const position = state.playing ? state.time + (Date.now() - at) / 1000 : state.time;
```

## `parseState` is the security boundary

The server stores your state without looking at it — it cannot know what a
tool's state should be, because it does not know the tool. So `parseState`
is the only thing between another peer's message and your components. The
room link is the only credential in this product: whoever has it can send
anything, and your tool will be handed it.

Write it as if the sender were hostile. Check every field, clamp every
number, and return `null` for anything you did not expect — the state is
then treated as if the tool were off, which is always a safe place to land.
`web/src/tools/youtube/state.ts` is 40 lines of exactly that, and its test
file is the list of things a peer might try.

Then go one step past the field, to what the field is FOR. The `video`
tool's state carries a URL a stranger chose and hands it to a `<video>` or
an `<iframe>` inside the page that holds this room's chat key, so checking
that it parses as a URL is not enough: it is http(s) only, absolute,
capped, and it REFUSES OUR OWN ORIGIN. The frame is sandboxed with
`allow-scripts allow-same-origin`, which is only a sandbox while the
document inside it is somebody else's — point it at us and the sandbox
stops being one. No amount of field validation would have caught that;
asking "what does this value become?" did.

## What the server enforces (and nothing else)

`server/src/domain/tools.ts`:

| rule | value |
| --- | --- |
| tool id | `^[a-z][a-z0-9-]{1,31}$` — namespace yours (`acme-timer`) |
| state size | 4 KiB of JSON, per tool |
| tools per room | 8 at once; past that the shelf says the room is full |

The state is echoed to every peer on every change and rides in `welcome`.
That is the budget it has to live inside: a cursor, a queue, a
scoreboard — not documents. A tool with real data to move should move it
peer to peer over the existing file channel rather than through here.

## Two people doing the same thing at once

Last word wins is only safe if the moves are shaped for it. The YouTube
tool's queue (`web/src/tools/youtube/queue.ts`) is the worked example:
when a video ends, every player in the room reaches the end within a
second of each other and every one of them tries to advance. That is fine
— advancing past the item that is on lands on the same next item whoever
does it — but a straggler that arrives late must not drag the room back
to the film it already left, so it checks first that what IT was playing
is still what the room has on.

Write your moves as functions of the state you were handed, make them
land in the same place when repeated, and refuse them when the state has
moved past you. That, and not a lock, is what keeps twenty people from
fighting over one shared value.

## Writing one

1. `web/src/tools/<your-tool>/` with an `index.ts` exporting a
   `ToolDefinition`.
2. Ship your own strings (`text.ts`): `en-US` is required, other locales
   fall back to it key by key. `name` and `summary` are read by the shelf;
   the rest is yours. A value may be a string, plural forms, or a list of
   variants drawn at random — the room's copy has a sense of humour and you
   are welcome to it, except in anything a screen reader announces as a
   name and anything that instructs.
3. Ship your own icon. The app's icon set is not part of the contract.
4. Prefix your CSS class names with your tool id. Stylesheets are global
   once they are in the page. The shelf's own kit is the exception and is
   yours to use, so your panel looks native rather than like a second
   design: `tool-label`, `tool-row`, `tool-field`, `tool-actions`,
   `tool-open`, `tool-stop`, `tool-error` — the shelf draws the frame
   (`tool-panel`) and the row around them. A stage view can sit inside
   `screen-stage` for the room's frame.
5. Add it to `TOOLS` in `registry.ts`. That is the whole installation.

The stage holds one thing at a time: the tool whose state changed most
recently wins it, and a viewer who pins a screen or a person takes it back
for themselves. Known rough edge, now that there are two tools with
stages: turning one on displaces the others with nothing on screen saying
so. The displaced tool keeps running and its row in the shelf still says
it is on, but the room is not told which one it is looking at. If your
tool has a stage, expect to share it.

And expect it never to be drawn at all. A participant may refuse to take
part in what the room puts on, and that refusal is theirs alone: neither
your `Stage` nor your shelf panel is mounted for them, while the room's
state goes on existing and reaching everyone, this tool included. So
nothing your tool needs may live in the lifecycle of those components —
no timer it counts on, no work it only does on mount, nothing kept
between renders that cannot be rebuilt from `state`. The value is the
tool; the views are one way of drawing it, for the people who want it
drawn.

Refusal touches neither `state` nor `setState`. The tool stays on for the
room, and the shelf key stays lit for the person who refused — turning it
off would lock the door from outside, and they may change their mind.

## When a tool needs the app

One shared value and your own two components cover more than it sounds
like, but not everything, and the ceiling is a real one rather than a
formality. The `video` tool hit it first: finding the video inside a page
means READING that page, and a browser may not read another origin —
CORS forbids it. No amount of cleverness inside a tool gets around that,
so the lookup is an app route (`/api/sources`, in both edges) and the tool
imports its client from `../../api`, plus `../../lib/desktop` for the
desktop shell's picker window.

That is allowed, and it is the exception rather than the pattern. What it
costs:

- **Both edges, one tag.** A route is protocol: Node and Worker implement
  it together or the tool works in dev and is missing in production.
- **Guards, not assumptions.** The `video` tool works with no route and
  with no desktop shell; each import is behind a check, so a build that
  ships the tool without the route degrades instead of breaking.
- **Somebody vouches.** A tool that reaches into the app is no longer
  reviewable on its own folder. Whoever assembles the build answers for
  that reach the same way they answer for the registry.

If you are about to cross this line, check first that your need is really
outside the browser's reach. Most are not — a queue, a scoreboard, a
drawing, a timer all fit in the one value.

## Deliberate limits

**A tool is part of the build.** There is no runtime loading of somebody
else's script, and that is a decision, not a missing feature: a room link
is its only credential, and everything in the page can read everything in
the room — including the chat key, which lives in the URL fragment. A tool
fetched at runtime from another origin would be a stranger holding the keys
to the room. Whoever assembles a build vouches for the list in
`registry.ts`.

**One shared value.** A tool does not get the WebRTC mesh, the media
tracks, the chat, or a room of its own in the protocol. That ceiling is
what keeps a tool cheap to review and impossible to break the room with. A
tool that genuinely needs more is a conversation to have first — the
`video` tool's route was one, and the section above is what came out of
it — never a wider contract to assume.

**Everything a tool knows is public to the room.** There is no private
per-person state. If your tool needs a secret, it does not belong here.
