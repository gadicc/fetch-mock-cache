# CI and release operations

The package is released from `main` and the release-channel branches listed in
`.github/workflows/release.yml`. The repository's default branch is currently
`dev`; it is not the package release branch.

## Validation

Use pnpm 10.34.4. Run `pnpm run ci` before release work. This builds the package,
checks Biome, runs automation regressions and coverage, installs a real npm
package tarball in a temporary consumer, checks JSR documentation and
publishability, and runs Node/Jest/Vitest/Deno/Bun examples. The reusable test
workflow performs the same gates before publication. Deno documentation and
publish dry-runs can require registry access; tarball installation uses
`--prefer-offline` but is not guaranteed to work without a warm npm cache.

Useful focused commands:

```sh
pnpm run test:scripts
pnpm run check:package # run pnpm run build first
pnpm run check:jsr
pnpm run check:report # after coverage and runtime results have been generated
```

The packed consumer lives outside the repository so undeclared root dependencies
cannot satisfy imports. Its TypeScript check uses strict NodeNext resolution and
checks declaration files. The npm Deno adapter intentionally uses `@std/path`;
its files/import graph are checked statically here, while Deno behavior is tested
by the Deno runtime examples through their documented import map.

The JSR gate derives entrypoints and imports from `jsr.json`, lints module/member
docs, inspects the pinned Deno documentation JSON format, and checks direct
re-export specifier docs with the TypeScript compiler API. The npm/JSR export
keys must match. Keep JSR's package setting **Readme Source = Readme** so its
Overview continues to show the README. A dry-run checks publishability; it does
not prove the registry will authorize a real publish.

## GitHub Pages reports

Reports are served at <https://gadicc.github.io/fetch-mock-cache/>. This URL is
for aggregate coverage, runtime status, and the source run's commit/time only.
Request/response fixtures, credentials, and the raw checkout are never uploaded
to Pages. Generated report files are not committed.

The `reports` job depends on `test`, including failed test jobs. It downloads raw
artifacts into a separate runner-temporary directory and produces SVG/JSON
badges, `results.yaml`, `meta.json`, an HTML index, and a job summary. Missing
suites show **unknown**, never pass. Coverage from failed test jobs is unknown.
Successful jobs with incomplete/malformed data are rejected. Truncated or
malformed results from a failing job become all-unknown, with a visible warning.
The parser also checks real generated inputs in local CI and PR validation;
main-branch report preparation remains outside the release gate. Reports may lag if
artifact generation or deployment fails; inspect the linked commit and time.
README image proxy and browser/Pages caches can also delay visible badge updates.

The `deploy-pages` job has Pages/OIDC permissions and runs a pinned first-party
deployment action, with no checkout or project code. It rechecks current main
immediately before deploying. Old-commit reruns are skipped. Deployment is
serialized independently of publication. Only the release job participates in
the release concurrency group, so Pages waits cannot stall later releases. A push arriving after the freshness check can briefly leave the
previous commit's report until its own report deploys; `meta.json` makes that
identity explicit.

`release` depends only on `test`. Report generation, upload, and deployment
failures do not block npm/JSR publishing. They can make the overall **Test &
Release** workflow badge red even when the release job succeeded. Check job
conclusions separately. Raw artifact upload is best-effort so an artifact outage
also does not gate package publication. Artifact names include the producing
test attempt, exported by the reusable workflow; Pages artifacts also carry
the report-producing attempt. Metadata distinguishes report and test attempts.
Reports from reruns cannot
accidentally consume results left by an earlier attempt.

### Initial rollout

1. Inspect repository **Settings → Pages** before changing it. These deployments
   replace the whole Pages site; do not overwrite an unrelated existing site.
2. Set the Pages source to **GitHub Actions**. CI deliberately does not enable or
   change repository settings using `configure-pages`.
3. In the `github-pages` environment, allow `main` deployments. The default
   branch is `dev`, so a default-branch-only policy would reject these runs.
   Keep protection rules appropriate for a public aggregate test report.
4. Push the reviewed workflows to `main`, then verify the report's commit,
   the coverage SVG and every runtime SVG after the first deployment.
5. Synchronize the reviewed CI changes to default branch `dev` using the normal
   branch workflow. Dependabot reads its configuration there, and PRs targeting
   `dev` need the updated reusable checks too. During this rollout both branches
   started at the same commit, so the same reviewed change can fast-forward both.
6. Remove the obsolete repository secret `GH_TOKEN_GISTS` after confirming the
   migration. Optionally archive the old gists. Do not copy its value anywhere.

Published npm/JSR READMEs contain the badge URLs from their publication time;
new URLs will not work until the first Pages deployment succeeds. PR checks
remain read-only, receive no secrets, and cannot deploy Pages. Release-channel
branches other than `main` cannot overwrite main's reports.

### Verifying failure reports

The workflow's manual **verify_failure_reporting** input defaults to false.
When true, the test job runs its real checks, deliberately truncates only the
ignored aggregate runtime-results file, and fails at a named verification step.
The release job is explicitly disabled for that run. Reports must still deploy,
showing failure, unknown coverage and all-unknown suites with a warning. This
verifies GitHub's failed-ancestor conditions and malformed artifact handling.

After a probe, dispatch a normal run on `main` (input false) to restore the live
report. It runs the ordinary release decision; if the commit was already
released, semantic-release publishes nothing. For attempt handling, rerun the
probe's failed jobs before the normal run and check its new attempt metadata.
An old-commit rerun must not overwrite a newer main report.

## Action and tool updates

Actions use verified upstream commit SHAs with version comments. Dependabot
proposes weekly updates. Pinning a composite action does not pin its internal
steps independently; review those when updating the outer action. The Pages
upload action currently pins its internal upload-artifact dependency too.

Release tools use exact Node/npm/Deno versions; test Deno matches release Deno.
The publishing job restores no package-manager cache. Read-only test jobs keep
their caches, frozen lockfiles, and ignored install scripts. Preserve full git
history and release push authentication when updating checkout settings.

`conventional-changelog-conventionalcommits` is pinned to 9.3.1 because the
installed release-notes writer is incompatible with the preset 10 function
templates. The script regression checks actual configured plugins, rendered
features/fixes/migration text, compare links, and version selection. Dependabot
ignores preset major upgrades until a compatible writer/preset combination is
verified. Do not remove the regression when upgrading.

## npm and JSR trust settings

The local workflow uses no `NPM_TOKEN` or `JSR_TOKEN`. Only the release and Pages
deploy jobs can request OIDC tokens; report generation and PR/test jobs cannot.
GitHub's automatic repository `GITHUB_TOKEN` still creates tags, releases, and
semantic-release comments/labels. Those repository permissions are separate
from registry publishing authentication.

On npm, the trusted publisher for `fetch-mock-cache` must match:

- Owner: `gadicc`
- Repository: `fetch-mock-cache`
- Workflow filename: **`release.yml`**, not a path or display name
- Direct `npm publish` permission
- Dist-tag management permission if publishing release channels requires it
- An environment matching the release job, if one is configured

The current release job has no environment. Do not add an npm environment
restriction alone: that would break publishing. Recommended follow-up is a
coordinated `release` environment in GitHub and npm, restricted to intended
release branches. This narrows trust beyond the workflow filename: the Pages
job currently shares `release.yml` and also has OIDC permission. Its only action
is pinned and it runs no project code, but workflow-only npm trust does not
separate jobs. Adding an environment can create new GitHub state, so review and
synchronize both sides before the next publish. Also inspect/remove unused
trusted publishers and obsolete npm publishing tokens, and use the recommended
package 2FA/token policy.

JSR must link `@gadicc/fetch-mock-cache` to `gadicc/fetch-mock-cache` and allow the
intended GitHub Actions publishing identity. Its trust is separate from npm's
workflow settings. Inspect package/scope restrictions; do not assume a passing
Deno dry-run verifies them.

The published npm 3.1.0 provenance was inspected during this work. It identifies
this repository, `release.yml`, `main`, commit `310c7d6`, and the corresponding
GitHub-hosted workflow run. npm trusted publishing automatically generates
provenance for public packages from public GitHub repositories. After a release,
check the new version's registry attestation and source identity too.

The main branch was unprotected and the repository ruleset list was empty at
initial inspection. Recommended follow-up: require validation before merge with
an explicit maintainer bypass policy. This patch does not silently change
branch protections, npm/JSR account policy, or token settings.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[JSR publishing](https://jsr.io/docs/publishing-packages), and
[Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Recovering a partial release

semantic-release chooses a version, prepares package versions, then creates and
pushes a tag before publishing. Our publish plugins run **npm → JSR → GitHub**.
A failure after tagging is not repaired by blindly rerunning semantic-release:
the tag can make it believe there is nothing left to release. It can also refuse
an old checkout that is behind its remote branch.

Before recovery, record the failed run, tag, exact source commit, both registry
versions, npm dist-tags/provenance, and GitHub release state. Use read-only checks
first. Do not change source placeholder versions (`package.json` and `jsr.json`
versions are normally updated only in the release workspace).

- **No publish step ran:** fix the prerequisite and run the workflow on the
  current release-branch HEAD. This applies to the original gist failure: it
  happened before semantic-release, so it did not create a release tag.
- **Tag exists, neither registry has the version:** an explicitly reviewed
  maintainer option is to remove/reset only that failed tag and retry from the
  intended branch/commit after confirming it has no published consumers. Never
  delete a tag merely because a workflow is red; inspect both registries first.
- **npm published, JSR missing:** preserve the npm version and tag. Check out
  that exact tag in a disposable recovery checkout, set only the recovery
  checkout's `jsr.json` version to that tag's version, and run a reviewed JSR-only
  recovery through an authorized GitHub OIDC publishing path or an interactive
  local `deno publish`. JSR version changes are not committed by our plugin.
  A local publish does not produce GitHub OIDC provenance. Do not rerun npm or
  bump a new package version just to fill the JSR gap.
- **Registries published, GitHub release missing:** create the missing GitHub
  release for the existing tag using the reviewed generated notes.
- **Wrong package version/content published:** stop and assess consumers before
  considering deprecation or a corrective release; do not overwrite immutable
  registry versions. Manual npm publishing changes the auth/provenance path and
  must not be treated as equivalent to the trusted workflow.

Finish by confirming version/commit consistency in npm, JSR and GitHub, checking
provenance where applicable, and recording recovery actions. Never log credentials.
