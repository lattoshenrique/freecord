## What

<!-- What does this PR change? -->

## Why

<!-- Why is this change needed? Link an issue if there is one. -->

## Testing

- [ ] `npm run typecheck` passes (server, web and worker)
- [ ] `npm test` passes
- [ ] `npm run build` passes

## Checklist

- [ ] One concern per PR — a refactor bundled with a feature is two PRs
- [ ] New route or protocol message lands in **both** edges (`server/` and `worker/`)
- [ ] User-facing text goes through i18n (`web/src/i18n/`), never hardcoded
- [ ] If this touches the protocol, the screen relay tree, or room lifetimes, it's called out below and [docs/architecture.md](../docs/architecture.md) is updated in this PR
- [ ] No new dependency, or the reason for one is explained below
