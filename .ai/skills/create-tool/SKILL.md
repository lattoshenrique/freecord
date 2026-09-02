---
name: create-tool
description: Create or extend a Freecord room tool under web/src/tools, including its shared state, UI, translations, tests, and registry entry. Use when adding a tool to the room's tool shelf; do not use for unrelated controls or server-only features.
---

# Create a Freecord tool

Build a tool that behaves as native room state and remains safe when its state
comes from an untrusted peer.

## Required context

Before editing, read these files completely:

1. [`.ai/rules.md`](../../rules.md) for repository-wide constraints and the
   shared-worktree protocol.
2. [`docs/tools.md`](../../../docs/tools.md) for the authoritative tool
   contract and installation workflow.

Then inspect `web/src/tools/contract.ts` and `web/src/tools/registry.ts`. Use
`web/src/tools/youtube/` as the example for a self-contained synchronized tool.
Inspect `web/src/tools/video/` only when the requested tool genuinely needs an
app route or desktop integration.

## Non-negotiable boundaries

- Keep the tool in `web/src/tools/<tool-id>/` and register one exported
  `ToolDefinition` in `web/src/tools/registry.ts`.
- Treat `parseState` as a security boundary. Reject unexpected shapes, bound
  strings and collections, clamp numbers, and test hostile input.
- Keep the shared JSON state within the 4 KiB protocol limit. Reconstruct UI
  from that state; do not depend on a component remaining mounted.
- Put every user-visible string in the tool's localized text catalog. Ship
  `en-US`, `pt-BR`, `es`, `zh-CN`, and `ja`; never hardcode UI copy.
- Namespace CSS classes with the tool id and keep icons local to the tool.
- Do not load executable tool code at runtime. Every shipped tool is reviewed
  and bundled with the build.
- Do not expose the WebRTC mesh, chat key, media tracks, or other room internals
  to a tool. If the feature needs a new route or protocol message, keep shared
  decisions in the server core and implement both Node and Worker edges in the
  same change.
- Preserve existing wire ids and protocol values. Do not rename them as part
  of an unrelated tool addition.

## Completion

Cover state parsing and deterministic transitions with focused unit tests.
Run formatting checks through `git diff --check`, the repository typecheck,
and the tests touched by the tool. Because a tool changes the UI, run the
browser suite against a fresh build:

```bash
npm run typecheck
npm test
E2E_BUILD_WEB=1 npm run test:browser --workspace e2e
```

Use the commit and deployment protocol in `.ai/rules.md`; creating a tool does
not itself authorize a production deployment.
