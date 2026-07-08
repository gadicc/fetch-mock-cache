# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript ESM package. Source lives in `src/`, with public entry
points in `src/index.ts`, shared cache/store logic in `src/cache.ts`,
`src/fetch-cache.ts`, `src/store.ts`, and runtime adapters in
`src/runtimes/`. Store implementations live in `src/stores/`. Unit tests are
colocated as `*.spec.ts` beside the code they cover. Cross-runtime examples and
smoke tests live under `tests/runtimes/{node,deno,bun}/`. Build output is
generated into `lib/`; do not edit generated files directly.

Any new public module needs matching entries in `package.json#exports` (pointing
at `./lib/*.js`) and `jsr.json#exports` (pointing at `./src/*.ts`), including
the `.js` and `.ts` extension variants.

## JSR Documentation Score

Keep JSR's package score at 100% when changing public API:

- Every file listed in `jsr.json#exports` must start with a `/** ... @module
  ... */` doc comment that summarizes that entrypoint.
- Every exported symbol and every public member of exported interfaces/classes
  should have JSDoc. This includes option properties, class fields,
  constructors, and overridden public methods in exported store classes.
- Public exported types must not reference private helper types. Export those
  helper types when they are part of the public type surface, and re-export them
  from runtime entrypoints when public options refer to them.
- If a type is shared by a public entrypoint such as `src/cache.ts`, define or
  re-export it from that entrypoint so JSR can document it.
- For local checks, use `deno doc --lint --quiet --no-lock
  --unstable-sloppy-imports` against all `jsr.json#exports` source files. If
  the Deno runtime import needs `@std/path`, use a temporary import map derived
  from `jsr.json#imports`.

## Build, Test, and Development Commands

Use pnpm 10.x, as declared in `package.json`.

- `pnpm test` runs all `src/**/*.spec.ts` tests with `node:test` and `tsx`.
- `pnpm run build` compiles TypeScript with `tsc` into `lib/`.
- `pnpm run lint` runs Biome linting over `src/`.
- `pnpm run format` formats `src/` with Biome.
- `pnpm run coverage` writes LCOV coverage to `lcov.info`.
- `pnpm run ci` performs typecheck, Biome CI, coverage, and runtime tests.
- `cd tests/runtimes && ./test.sh` runs Node, Deno, and Bun compatibility
  tests when those runtimes are installed.

## Coding Style & Naming Conventions

Biome controls formatting: 2-space indentation, LF line endings, 80-column
line width, double quotes, semicolons, and trailing commas where valid. Prefer
ES modules only; CommonJS and TypeScript namespaces are lint errors. Avoid
`any`, `var`, and unused imports. Use descriptive kebab-case filenames such as
`fetch-cache.ts`, and keep test names aligned as `module.spec.ts`.

## Testing Guidelines

Add or update colocated `*.spec.ts` tests for behavior changes. The core suite
uses Node's built-in test runner with `expect`; runtime fixtures under
`tests/runtimes/` verify consumer usage across Node, Deno, Bun, Jest, and
Vitest. Run `pnpm test` for quick feedback and `pnpm run ci` before larger
changes or release work. Keep cached HTTP fixture data deterministic and avoid
committing secrets in recorded requests or headers.

## Commit & Pull Request Guidelines

- Use conventional commits with scopes for title, e.g.
  fix(store): better handling of null body` and `chore(pkg): fix lint script`.
  Use a concise scope when useful: `fix(cache): ...`, `chore(readme): ...`.
  This is important since the repo uses `semantic-release` to bump versions
  appropriately according to commit messages.  Breaking changes MUST include
  a "BREAKING CHANGE: <explanation>" in the commit's footer.
- Before committing, run Biome formatting/organize-imports on changed files
  with `pnpm biome check --write <paths>`. Use this instead of relying only on
  `pnpm run format`, since that script currently formats `src/` but not
  runtime fixtures or other changed files. Then run `pnpm biome ci`; for
  behavior, test, package, or runtime changes, also run `pnpm run ci`.
- In the body, include the motivation, summary of changes, and anything else of
  note.  Also list verification commands run, link related issues, and call ou
  compatibility impact for Node, Deno, or Bun when relevant.
- At bottom: "Co-authored with <Assistant> (<model>, reasoning <level>)"
- If and only if YOU are the Codex tool, use the top-level `model` and
  `model_reasoning_effort` values from `~/.codex/config.toml` for `<model>` and
  `<level>` when present (not relevant for Antigravity or other non-Codex
  assistants).
- If the exact assistant name, model and reasoning level are unknown and cannot
  be inferred, ask the user before committing and then reuse that answer for the
  rest of the session.
- Keep commit body's line lengths below 72 characters and wrap as needed.

## Coherence

For all changes, ensure the `README.md`, `skills/fetch-mock-cache/SKILL.md`,
examples, related files, jsdoc, and everything else relevant remains relevant
and up-to-date.

## Security & Configuration Tips

This package records HTTP request and response data for tests. Review fixture
changes carefully for tokens, cookies, authorization headers, or sensitive query
parameters before committing.
