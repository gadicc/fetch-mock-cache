Model: `claude-fable-5-2`. Read-only follow-up review through Claude Code.

# Follow-up review: CI/release change

**No remaining blockers found in the bundle.** Nothing was executed, and the final CI run is still the gate for the follow-up changes, since I can't check the smoke script's API use (`mode: "auto"`, `cache.options`, `X-FMC-Cache`) against `src/`.

## Confirm before pushing

- **PR trigger:** `test.yml` in the bundle has only `workflow_call`, and no PR caller is included. If nothing calls it on `pull_request`, PR checks no longer run and the `check:report` step is dead. Confirm an existing caller workflow covers PRs.
- **Order of operations:** the probe input only exists on main after the push, and that push run publishes 4.0.0. The failure path is therefore proven after the release, not before; wait for the push run to finish so the two Pages deploys don't interleave.

## Watch during the hosted probe

- **Pages artifact name:** `github-pages` is still a fixed name. Re-running the probe's failed jobs reruns `test`, `reports` and `deploy-pages`, so the run gets a second `github-pages` artifact. I recall `deploy-pages` rejecting "Multiple artifacts named…" but can't confirm it applies across attempts. If it does, give the Pages artifact the same attempt-suffix treatment via a `reports` output.
- **Timeouts:** the probe exercises `failure` only. A job-level timeout may report `cancelled`; the generator handles that outcome, but I can't confirm how `!cancelled()` evaluates there. The worst case is a stale report, not a false green.

## Non-blocking

- **Report metadata:** when only `reports`/`deploy-pages` are rerun, `meta.json` and the run link name the report's attempt, while the data comes from the earlier test attempt. Recording `artifact_attempt` in the metadata would make that explicit.
- **Coherence:** `AGENTS.md` still describes the old `pnpm run ci` contents and the manual `deno doc` procedure, not `check:jsr`, `check:package` or `check:report`.

## Checked and sound

- **Status conditions:**
  - `release` has no status function, so it still requires a successful `test`; `inputs` is empty on push, so normal pushes release as before.
  - `deploy-pages` now has an explicit status function and fails closed on a failed, skipped or stale `reports`.
- **Probe safeguard:**
  - Release is blocked twice, by the `if` and by the failing `test`, and reruns keep the same inputs.
  - A push can never set the flag.
  - The probe step only runs after the real checks pass.
  - Off main, no report is deployed.
- **Attempt outputs:**
  - Re-run all and re-run failed with a failed `test` both produce and consume the new attempt's artifacts.
  - A reports-only rerun reads the earlier attempt through the preserved output.
  - If the output is ever empty, the fallback finds no artifact: a success run fails closed and a failed run shows all-unknown.
- **Malformed fallback:**
  - Success stays strict.
  - Non-success discards partial passes, shows all-unknown with a warning, and never shows coverage.
  - The probe's truncated line hits exactly this path, and the spec covers it.
- **Other fixes:** the npm pin matches in both workflows, concurrency is on the `release` job only, the temp directory is canonicalised before comparison, and the `finally` block in `check-jsr` no longer masks the original error.
