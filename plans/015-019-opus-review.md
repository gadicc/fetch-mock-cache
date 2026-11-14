Model: `claude-opus-5-5`. Read-only plan review through Claude Code.

# Plan review: 015–019 (Opus 5.5)

**Verdict:** All five plans are feasible to implement in this checkout once the must-fix items below are folded in. The biggest risks are in plan 015 (Pages architecture, stale-badge rules, release independence) and plan 019 (how the consumer is isolated). Plans 016 and 018 each have one correctness trap that would make their regression gates pass vacuously.

I reviewed only the supplied bundle. Anything marked **verify** is my expectation about tool or GitHub behavior, not something I confirmed.

---

## Cross-cutting

**X1 (must-fix): Consolidate shared edits and fix the implementation order.**
- Plans 015, 016, 018 and 019 all edit `package.json` scripts. Plans 015, 017 and 018 all edit `test.yml`. Plans 015, 017, 018 and 019 all write `docs/ci-release.md`.
- Add one `test:scripts` script (`node --test "scripts/*.spec.mjs"`; Node 22 supports globs here) and wire it into `ci:core`. Don't add per-plan ad-hoc wiring.
- Recommended order: **016 → 019 → 018 → 015 → 017**. Plan 017 goes last so the SHA-pinning pass also covers the new Pages actions and any action added by 018.

**X2 (must-fix): Treat the default branch as `dev`, not `main`.** Session git metadata reports `dev` as the main branch; confirm it on the remote. This matters for plan 015:
- `workflow_run` triggers always use the workflow file from the default branch, and `GITHUB_REF` there points to the default branch.
- The auto-created `github-pages` environment usually restricts deployments to the default branch (**verify**).
- So main-only Pages deploys need the environment policy to explicitly allow `main`. Document this as a maintainer prerequisite.

**X3 (must-fix): Never interpolate run metadata directly into `run:` scripts.** Pass `github.sha`, `github.ref_name`, run URL and `needs.test.result` through `env:`. The PR job-summary path must not interpolate `head_ref` or titles into shell.

**X4 (optional): Biome won't format the YAML.** It doesn't cover YAML, so `pnpm biome check --write` on `.github/**` won't validate anything. Use `actionlint`, and record if it isn't installed rather than implying the YAML was validated.

---

## Plan 015: GitHub Pages reports

**015-M1 (must-fix): Pick a single architecture. I recommend sibling jobs in `release.yml`, not `workflow_run`.**
- `actions/deploy-pages` deploys an artifact from the *current* run (**verify** for the version you pin).
- A separate `reports.yml` driven by `workflow_run` would need `actions: read` to fetch the other run's artifacts. That breaks the stated "contents:read + pages:write + id-token:write only" rule. It would also hit the default-branch issue in X2.
- Recommended shape:
  - `test`: unprivileged. Always uploads raw `lcov.info` and `results.yaml` (`if: always() && inputs.upload_artifacts`, `if-no-files-found: warn`).
  - `reports`: `needs: test`, `if: always() && needs.test.result != 'cancelled' && github.ref == 'refs/heads/main'`, `contents: read` only. Downloads artifacts from the same run (no extra permission needed), runs `scripts/ci-report.mjs`, and uploads the Pages artifact.
  - `deploy-pages`: `needs: reports`, `pages: write` and `id-token: write` only, `environment: github-pages`, job-level `concurrency: { group: pages, cancel-in-progress: false }`. Runs **only** pinned first-party Pages actions, with no checkout and no repo scripts.
  - `release`: `needs: test` only (unchanged).
- Remove `reports.yml` from scope if it ends up unused.

**015-M2 (must-fix): Report generation must not be able to block release.** Step 2 says reports are generated in the test job. If a malformed LCOV file makes the generator exit non-zero there, the test job fails and `release` is skipped. That breaks the independence goal.
- Do full generation in the `reports` job (M1).
- In the test job, limit work to a job summary with `continue-on-error: true`.

**015-M3 (must-fix): Define the failed and stale semantics up front.**
- **Expected suites:** keep one list (`node: native/jest/vitest`, `bun: native`, `deno: native`). A suite missing from `results.yaml` renders `unknown`, never pass.
- **Failed test job:** pass `needs.test.result` in. If it isn't `success`, every runtime badge without an explicit result shows `unknown` or `fail`. The coverage badge either shows `unknown` or is labelled as coming from a failing run. Pick one and test it.
- **Stale local results:** check whether `tests/runtimes/results.yaml` or `lcov.info` are tracked or could survive in the checkout. The generator should read only from the downloaded-artifact directory, never from the repo tree.
- **Visible run identity:** put commit SHA and timestamp in `meta.json` and the HTML, so a stale badge can be traced to its run.

**015-M4 (must-fix): Stop older runs from overwriting newer results.** Concurrency alone doesn't do this.
- Workflow-level `release-${{ github.ref }}` serialization covers normal pushes. It does **not** cover *re-runs* of an old run, which carry the old SHA. Plan 017's recovery runbook makes such re-runs likely.
- Add a guard in `reports`: run `git ls-remote origin refs/heads/main` (contents:read is enough) and skip the Pages upload unless it equals `github.sha`.
- Also note that `cancel-in-progress: false` still replaces a *pending* run with a newer one. That's acceptable.

**015-M5 (must-fix): Make main-only gating explicit for both events.** A `workflow_dispatch` can target any ref, so gate on `github.ref == 'refs/heads/main'`, not on event type.
- Don't rely on the `upload_artifacts` input. It is true for every release-channel branch, `master` included.
- PR runs must create no Pages artifact, and `pr.yml` must keep `contents: read`.

**015-M6 (must-fix): Spell out rollout order in `docs/ci-release.md`, with no settings mutation from CI.**
- Do **not** use `actions/configure-pages` with `enablement: true`. It changes repository settings.
- Order for the maintainer:
  1. Set Pages source to GitHub Actions.
  2. Allow `main` in the `github-pages` environment branch policy.
  3. Merge.
  4. Confirm the badge URLs serve content.
  5. Delete `GH_TOKEN_GISTS` and optionally archive the gists.
- Warn about two side effects:
  - Deploying replaces the whole Pages site. Check first that no existing branch-based Pages content would be wiped.
  - The npm and JSR READMEs are frozen at publish time, so badges 404 until Pages is live.

**015-O1 (optional):**
- Set short `retention-days` on raw artifacts.
- Note that the README image proxy and Pages' default cache make badge updates lag by minutes; that isn't a bug.
- Pages failures will turn the "Test & Release" workflow badge red even when release succeeded. Accept this, or document it.

---

## Plan 016: release notes regression

**016-M1 (must-fix): The test must load the same module instances semantic-release loads.**
- With pnpm's strict layout, `@semantic-release/release-notes-generator` and `commit-analyzer` are probably not importable from `scripts/` (they're transitive deps of `semantic-release`). semantic-release resolves plugins and the preset relative to the project before falling back to its own copies (**verify** for v25).
- A test that resolves a *different* copy can pass while releases still break, or the reverse.
- Fix: either add both plugins as explicit pinned devDependencies matching semantic-release's ranges, so the test and runtime share one copy, or resolve them via `createRequire` from semantic-release's own path. Then assert in the test which copy and version was loaded.

**016-M2 (must-fix): Build the plugin config the way semantic-release does.**
- Import `release.config.mjs` and merge its global options (`preset`) into each plugin's config. Don't hardcode `preset: "conventionalcommits"` in the test.
- Supply `options.repositoryUrl` from `package.json`, plus `lastRelease`/`nextRelease` with `gitTag`, so compare links are actually generated.
- Cover these cases:
  - `feat:` → minor
  - `fix(scope):` → patch
  - `fix(store)!:` with no footer → major
  - `BREAKING CHANGE:` footer → major, with the note text rendered under the breaking-changes heading

**016-M3 (must-fix): Prove the regression is real.** Record that the spec fails on the current lockfile *before* the dependency change, and paste the actual output into the index. Don't ship a toggle to reproduce it.

**016-M4 (must-fix, cross-plan): Stop Dependabot from undoing this fix.** If the fix pins the preset back a major (e.g. `^9`), plan 017's npm Dependabot config will immediately propose `10.x`. Either add an `ignore` rule with a comment pointing to plan 016, or state explicitly that the new CI regression is the guard.

**016-O1 (optional):** Prefer pinning the preset to a compatible major over overriding the generator inside semantic-release. It's smaller and less coupled to semantic-release internals.

---

## Plan 017: release workflow hardening

**017-M1 (must-fix): Resolve SHAs to commits correctly.** Use peeled refs (`git ls-remote <repo> 'refs/tags/vX.Y.Z^{}'`) so annotated tags resolve to the commit, not the tag object.
- Note in the docs that SHA-pinning a composite action such as `upload-pages-artifact` does not pin the actions it calls internally.
- Keep `upload-artifact` and `download-artifact` on compatible majors.

**017-M2 (must-fix): Removing `cache: "pnpm"` may not disable caching on `setup-node` v5 and later.** Newer versions can auto-enable caching from the `packageManager` field (**verify** for the pinned version). Set `package-manager-cache: false` explicitly in the release job. `setup-deno` in release should also have caching off.

**017-M3 (must-fix): Pin the release tooling exactly.**
- Replace `npm install --global npm@^11.5.1` with an exact version and keep `npm --version` logging. Alternatively, use a Node 24 line that already bundles a new-enough npm (optional; testing stays on 22.14).
- Pin one exact Deno version in both test and release. Plan 018's JSON parsing depends on it.

**017-M4 (must-fix): Address OIDC identity scope.** npm trusted publishing keyed only on `release.yml` accepts tokens from *any* job in that workflow that has `id-token: write`. With 015-M1, that includes `deploy-pages`. As far as I know, JSR's GitHub OIDC trust is repository-scoped (**verify**), so any id-token job in any workflow in the repo matters.
- Keep id-token jobs limited to pinned first-party actions with no repo code. The `reports` job must not have id-token.
- Recommend that the maintainer set an environment on the npm trusted publisher (e.g. `release`), restrict that environment to the release branches, and add `environment: release` to the release job.
- Document the exact matching behavior before switching. Referencing a new environment in a workflow auto-creates it on first run, which is a mild remote side effect, so flag it.

**017-M5 (must-fix): The partial-publication runbook needs real mechanics.** semantic-release creates and pushes the tag *before* the publish step. A plain re-run will see the tag, find no new commits, and publish nothing. semantic-release also refuses to release when the local branch is behind the remote. The runbook must cover each failure case:
- **npm failed, tag pushed, nothing published:** deleting the tag and re-running is the standard recovery. Make it a deliberate reviewed step, not a blanket ban.
- **npm ok, JSR failed:**
  1. Check out the tag.
  2. Set `jsr.json` `version` to the tag version. It isn't committed, because there's no `@semantic-release/git`.
  3. Publish via a reviewed OIDC path, either a dispatch workflow or a local interactive `deno publish`.
- **GitHub release missing:** create it manually using the generated notes.
- **Any manual npm publish:** it loses provenance and trusted publishing, and is subject to the token/2FA policy.

**017-O1 (optional):**
- `persist-credentials: false` in release is likely safe, since semantic-release builds its push URL from `GITHUB_TOKEN`. That can only be verified on a hosted run, so leave it as documented follow-up rather than changing it now.
- `issues` and `pull-requests` write could be dropped by disabling `@semantic-release/github` comments and labels. That's a trade-off for the maintainer.

---

## Plan 018: JSR validation

**018-M1 (must-fix): The JSON check will miss the exact case AGENTS.md warns about.**
- AGENTS.md says re-export specifiers (`export type { … } from`) are scored separately by JSR, and that `deno doc --lint` may miss them. `deno doc --json` likely shows the *original declaration's* `jsDoc` for re-exports, so the check would pass while JSR's score drops.
- Use the already-installed `typescript` compiler API to walk each entrypoint's export specifiers and require a leading JSDoc on each.
- Add a fixture with an undocumented re-export specifier.

**018-M2 (must-fix): Fail closed on the JSON shape.**
- Capture real `deno doc --json` output from the pinned Deno version (017-M3) as test fixtures. Assert the top-level `version` field and reject unknown versions.
- Skip `import` nodes. Require a `moduleDoc` node per entrypoint for the `@module` docs.
- Treat `declarationKind: "private"` nodes as failures, because they indicate a private type referenced by the public surface.

**018-M3 (must-fix): Mutation detection must include untracked files.** A new `deno.lock` is untracked, so `git diff` won't show it. Compare `git status --porcelain --untracked-files=all` before and after.
- Pass `--no-lock` wherever Deno accepts it (**verify** for `deno publish`).
- Clean the temporary import map in a `finally` block.

**018-O1 (optional):**
- Cross-check that the `package.json` and `jsr.json` export key sets are equal, mapping `lib/*.js` to `src/*.ts`. AGENTS requires parity.
- Add `check:jsr` to `pnpm run ci` too, since local `ci` already requires Deno. Then the "`pnpm run ci` passes" criterion actually exercises it.
- Note that `deno publish --dry-run` needs network to resolve `npm:` and `jsr:` imports.

---

## Plan 019: packed consumer smoke

**019-M1 (must-fix): Put the consumer in `os.tmpdir()`, outside the repo.** Node and TypeScript resolution walk up through parent `node_modules`. A consumer under the checkout would silently pick up root deps (`debug`, `@types/*`, `typescript`) and hide missing `dependencies` declarations.
- Give the consumer its own `package.json`.
- Assert that no path under the consumer's `node_modules/fetch-mock-cache` resolves through a symlink to the checkout (`realpath` check).

**019-M2 (must-fix): Pack with npm, the tool that actually publishes.** `@semantic-release/npm` uses npm. Use `npm pack --ignore-scripts --json --pack-destination <tmp>` and validate the reported file list plus the unpacked tarball. Don't use `pnpm pack`, whose packlist and script behavior can differ.

**019-M3 (must-fix): Decide in advance what happens if the smoke finds a real bug.**
- If `lib/*.d.ts` references `debug` types, consumers compiling with `skipLibCheck: false` will fail, because `@types/debug` is only a devDependency.
- The compiled Deno adapter may import `@std/path`, which isn't an npm dependency.
- Moving `@types/debug` to `dependencies` is within this plan's `package.json` scope. Anything touching `src/` is out of scope and must hit a STOP condition.
- The consumer may legitimately install `@types/node` and `typescript`.

**019-M4 (must-fix): Write negative tests as pure functions.** Feed `validate(fileList, exportsMap)` synthetic inputs (a missing export target, a stray `testUtils.js`, a `*.spec.js`). Don't mutate the real `package.json` or `lib/`.
- Statically walk relative imports from *all* export targets, including Bun and Deno, to catch non-exported internal modules or future subdirectories the `files` globs miss.

**019-O1 (optional):**
- Installing the tarball needs registry access for `debug` and `filenamify-url`. Use `--prefer-offline` with the warm `~/.npm` cache. Document that it won't work fully offline.
- Execute the Deno and Bun adapters only if the runtime is present and the run is explicitly opt-in. Otherwise check file and declaration existence only, leaving runtime behavior to `tests/runtimes/`.

---

## Hosted-only items to record as unverified in `plans/README.md`

- Pages source and `github-pages` environment branch policy
- First successful deploy, and badge URLs serving content
- npm trusted-publisher fields and the optional environment
- JSR repository link and OIDC scope
- Token/2FA policy
- Branch protection or rulesets on `main`
- `GH_TOKEN_GISTS` removal
- Whether `persist-credentials: false` would work for the release job

None of these can be verified from local checks.
