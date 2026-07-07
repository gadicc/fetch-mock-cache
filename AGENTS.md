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


Git history uses Conventional Commit-style messages, for example
`fix(store): better handling of null body` and `chore(pkg): fix lint script`.
Use a concise scope when useful: `fix(cache): ...`, `chore(readme): ...`.
Pull requests should describe the behavior change, list verification commands
run, link related issues, and call out compatibility impact for Node, Deno, or
Bun when relevant.

## Security & Configuration Tips

This package records HTTP request and response data for tests. Review fixture
changes carefully for tokens, cookies, authorization headers, or sensitive query
parameters before committing.
