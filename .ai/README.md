# Canonical AI workspace

`.ai/` is the only versioned home for files authored specifically for AI or
LLM use in this repository. It keeps project guidance independent of any
model, vendor, editor, or agent runtime.

## Rules

- Put shared agent instructions in [`rules.md`](rules.md).
- Put reusable skills in `skills/<skill-name>/`, with `SKILL.md` as the
  entrypoint.
- Put future AI-only prompts, schemas, templates, or evaluation fixtures under
  `.ai/` and document their owner and purpose close to the files.
- Never commit provider-specific AI directories or contracts such as
  `.claude/`, `.codex/`, `.gemini/`, `.cursor/`, or `.windsurf/`.
- Never keep a second copy of canonical instructions in a provider adapter.
  An adapter may only point to or load the corresponding file under `.ai/`.
- If a runtime cannot consume `.ai/` directly, create the smallest possible
  local adapter as a last resort and keep it untracked. It must contain no
  unique project knowledge.
- Compatibility entrypoints may be versioned only when a tool needs them for
  discovery. They must be short redirects to `.ai/`; the root `AGENTS.md` is
  one such bridge.
- Product and engineering documentation remains in its normal project
  location (`README.md`, `docs/`, and source files). AI guidance should link
  to those authoritative sources instead of copying them.

The root `.gitignore` enforces the common provider-specific paths. When a new
provider requires another local contract, add its path to `.gitignore` before
creating it.
