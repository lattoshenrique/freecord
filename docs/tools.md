# Writing a tool

A **tool** is something a room brings in besides the people in it: a video
everyone watches, a board everyone draws on, a timer everyone can see. The
dock has a shelf for them, and this document is how you put one there.

The short version: a tool is a folder that exports one object. It gets one
shared value it can read and write for the whole room, and everything else
it needs arrives as props. **It needs no server code and no protocol
change** — the edges already carry every tool that will ever exist.

```
web/src/tools/
  contract.ts        the types below, checked by the compiler
  registry.ts        the tools this build ships — one line each
  youtube/           the first tool, and the worked example
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

## What the server enforces (and nothing else)

`server/src/domain/tools.ts`:

| rule | value |
| --- | --- |
| tool id | `^[a-z][a-z0-9-]{1,31}$` — namespace yours (`acme-timer`) |
| state size | 4 KiB of JSON, per tool |
| tools per room | 8 at once; past that the shelf says the room is full |

The state is echoed to every peer on every change and rides in `welcome`.
That is the budget it has to live inside: a cursor, a playlist, a
scoreboard — not documents. A tool with real data to move should move it
peer to peer over the existing file channel rather than through here.

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
for themselves.

## Deliberate limits

**A tool is part of the build.** There is no runtime loading of somebody
else's script, and that is a decision, not a missing feature: a room link
is its only credential, and everything in the page can read everything in
the room — including the chat key, which lives in the URL fragment. A tool
fetched at runtime from another origin would be a stranger holding the keys
to the room. Whoever assembles a build vouches for the list in
`registry.ts`.

**One shared value, and no server code.** A tool does not get the WebRTC
mesh, the media tracks, the chat, or a route of its own. That ceiling is
what keeps a tool cheap to review and impossible to break the room with. A
tool that genuinely needs more is a conversation to have in an issue, not a
wider contract to assume.

**Everything a tool knows is public to the room.** There is no private
per-person state. If your tool needs a secret, it does not belong here.
