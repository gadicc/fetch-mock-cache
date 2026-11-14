Model: `claude-fable-5-2`. Read-only adversarial implementation review through Claude Code.

# Adversarial review: CI/release change

**Verdict: not ready to push.** There is one blocker in the failure-report path and one rollout point to confirm first. Nothing here was executed; findings marked "verify" depend on files I wasn't given or on hosted behaviour.

## Blockers

**1. Failure reports will never deploy** (`release.yml`, `deploy-pages.if`)
- **Trigger:** any main run where `test` fails.
- **Cause:** the `if` has no status function, so Actions prepends an implicit `success()`. As I understand Actions semantics, that looks at the whole `needs` chain, not just `reports`. `reports` runs via `always()` and succeeds, but `deploy-pages` is skipped because `test` failed.
- **Effect:** a red main keeps the last green badges, contradicting `docs/ci-release.md`. The green hosted run you plan to check will not exercise this path.
- **Fix:**
  ```yaml
  if: >-
    !cancelled() && needs.reports.result == 'success' &&
    needs.reports.outputs.current == 'true' &&
    github.ref == 'refs/heads/main'
  ```
  Then prove it once with a deliberately failing run.

**2. The first green run on main probably publishes 4.0.0** (rollout)
- **Trigger:** pushing this change to main.
- **Cause:** the docs say npm 3.1.0 is at `310c7d6`, and HEAD `8d9f303` is `fix(store)!` whose release died at the gist step. If that is right, this push is a major npm/JSR release, not a CI check.
- **Confirm before pushing:** that "commit/push and check hosted results" was meant to cover that. Also check that MIGRATING/README have v3→v4 notes; the README NB only mentions v2→v3 and v1→v2.

## Should fix

**3. Malformed results on a failed run leave stale green** (`ci-report.mjs`, `parseResults`)
- **Trigger:** a failed or timed-out job leaves a truncated `results.yaml`, or `test.sh` emits any status other than pass/fail.
- **Effect:** `parseResults` throws even when `successful` is false, the `reports` job fails, and the old report stays up.
- **Fix:** keep strict parsing for success; for non-success, catch and fall back to all-unknown.

**4. The report generator never sees real inputs before main**
- **Trigger:** `test.sh` output or Node's LCOV differs from the synthetic fixtures in `ci-report.spec.mjs`.
- **Effect:** `pnpm run ci` does not catch it; the first real parse is the hosted main run.
- **Fix:** add a step after the runtime tests in `test.yml` that runs the parser against the real `lcov.info` and `results.yaml`.
- **Verify:** `tests/runtimes/results.yaml` is not tracked in git. If it is, a `ci:core` failure uploads the committed copy and shows passes for suites that never ran.

**5. Tarball validation uses a different npm than publishing**
- **Trigger:** `check:package` packs with Node 22's bundled npm; the release job publishes with npm 11.21.2.
- **Effect:** the `files` list relies on `!` negations, where packlist behaviour could differ between npm majors, so the validated tarball may not be the published one.
- **Fix:** pin the same npm in `test.yml`, or run `check:package` in `release` before semantic-release.

**6. Pages jobs can hold up the next release** (`release.yml`, workflow-level `concurrency`)
- **Trigger:** a slow or stuck `reports`/`deploy-pages` in run N, or a reviewer/wait-timer rule added to the `github-pages` environment.
- **Effect:** run N+1's `release` queues behind run N's Pages jobs. An approval wait is not bounded by `timeout-minutes`, so releases could stall indefinitely.
- **Fix:** document "no reviewers or wait timers on `github-pages`", or move the group onto the `release` job.

**7. Dependabot and the new checks are inert until they reach `dev`**
- **Trigger:** committing only to main.
- **Effect:** Dependabot reads its config from the default branch and targets it, so no update PRs open. PRs into `dev` also keep running the old `test.yml`.
- **Fix:** include a main→dev sync in the rollout steps.

**8. `check-package.mjs` fails on macOS**
- **Trigger:** `tmpdir()` is a symlink (`/var` → `/private/var`).
- **Effect:** `assert.equal(installedReal, installed)` fails for local contributors; CI on Linux is unaffected.
- **Fix:** `realpath` the `mkdtemp` result first.

## Optional hardening

- **Release environment:** I believe npm ignores the environment when none is configured, so adding `environment: release` on the GitHub job first is safe; restrict npm second. This matters because `workflow_dispatch` on any branch currently reaches an OIDC-capable `release.yml`.
- **Re-export docs:** `validateReexportDocs` skips `import { X } …; export { X }` and `export * as ns from`.
- **Member docs:** `validateDocJson` checks only top-level symbols; interface and class members rely entirely on `deno doc --lint`.
- **JSR file list:** nothing asserts the published JSR files exclude helpers, as `validatePackage` does for npm. A stray `src/temp_regenerate.ts` would ship.
- **Re-runs:** add `overwrite: true` to both raw artifact uploads, and test "Re-run all jobs" and "Re-run failed jobs" once. I am unsure whether same-name uploads conflict across attempts.
- **Analyzer spec:** add a `docs:`/`chore:` → `null` case.
- **Consumer smoke:** it only imports; one `createFetchCache({ Store: MemoryStore })` call would exercise real JS.
- **Tool versions:** have `check-jsr` assert the Deno version it pins its JSON shape to. A local pass on another Deno proves little.
- **Error masking:** the `finally` assertions in `checkJsr` can hide the original error.
- **README:** badge alt text still says "Dynamic YAML Badge".

## Checked and sound

- **Release gating:** `release` needs only `test`.
- **Privilege boundaries:** PR, test and `reports` jobs have no OIDC or write scopes. `deploy-pages` runs no project code.
- **Stale runs:** the main-SHA check runs in both jobs and fails closed.
- **Report output:** success requires all suites to pass and valid LCOV; HTML and SVG output is escaped.
- **Release-notes spec:** it resolves the same plugin and preset paths semantic-release uses.
- **Type validation:** `skipLibCheck: false` with `types: []` does catch `.d.ts` files leaking `@types/*`.

## Could not verify

- Whether the pinned action SHAs and tool versions exist and match their tags.
- The real output format of `test.sh`.
- The Deno doc JSON shape.
