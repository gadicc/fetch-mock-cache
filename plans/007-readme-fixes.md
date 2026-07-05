# Plan 007: Fix the broken custom-store example and typos in README

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- README.md`
> If README.md changed since this plan was written, compare the "Current
> state" excerpts against the live file before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

The README's "Create your own Store" example — the documentation for the library's main extension point — does not compile: it references an undefined variable and reads/writes two different database collections. Anyone building a custom store starts by copy-pasting broken code. Two smaller typos undermine polish: a sentence that says `_once()` was "promoted to `_once()`" (should be `once()`), and a stray empty code fence at the end of the file.

## Current state

All in `README.md`:

1. Broken example (lines 169–178). Note `fetchContent(req…)` but `idFromRequest(request)`, and `"fmc"` vs `"jfmc"`:

   ```ts
   export default class MyStore extends FMCStore {
     async fetchContent(req: FMCCacheContent["request"]) {
       const _id = await this.idFromRequest(request);
       return (await db.collection("fmc").findOne({ _id })).content;
     }
     async storeContent(content: FMCCacheContent) {
       const _id = await this.idFromRequest(content.request);
       await db.collection("jfmc").insertOne({ _id, content });
     }
   }
   ```

2. Line 263: `` *  `_once()` has been promoted to `_once()` after a long, succesful testing period. `` — should read "promoted to `once()`", and "succesful" → "successful".

3. Lines 360–362: a stray empty ` ``` ` / ` ``` ` code fence at the end of the file.

4. Line 41–42: the sentence ends "for the [**exact code for different runtimes and testing frameworks**](#runtimes)\n." — the period is orphaned on its own line.

For accuracy, the real API the example must match: `FMCStore.fetchContent(request, options?)` and `storeContent(content, options?)` — see `src/store.ts:145-165`; `idFromRequest(request, options?)` — `src/store.ts:118-137`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Sanity  | `grep -n "jfmc" README.md` | no matches after fix |

No build/test gates — README-only change. Do not run `pnpm format` on the whole repo; biome's README handling is irrelevant here and formatting other files would pollute the diff.

## Scope

**In scope**: `README.md` only.

**Out of scope**:
- The TODO checkbox for invalid JSON (README:358) — plan 004 owns that line; don't touch it here.
- `MIGRATING.md`, TSDoc comments in source.

## Git workflow

- Branch: `advisor/007-readme-fixes`
- Commit: `docs(readme): fix custom-store example, once() typo, stray fence`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the custom-store example

Rename the parameter to `request` (matching `src/store.ts`'s own naming) and unify the collection name to `"fmc"`:

```ts
export default class MyStore extends FMCStore {
  async fetchContent(request: FMCCacheContent["request"]) {
    const _id = await this.idFromRequest(request);
    return (await db.collection("fmc").findOne({ _id }))?.content;
  }
  async storeContent(content: FMCCacheContent) {
    const _id = await this.idFromRequest(content.request);
    await db.collection("fmc").insertOne({ _id, content });
  }
}
```

(The added `?.` also stops the example from crashing on a miss — `findOne` returns null.)

**Verify**: `grep -n "jfmc" README.md` → no matches; `grep -c "idFromRequest(request)" README.md` → 2.

### Step 2: Fix the promotion sentence

Line 263 → `` *  `_once()` has been promoted to `once()` after a long, successful testing period. ``

**Verify**: `grep -n "promoted to" README.md` → shows `` promoted to `once()` ``.

### Step 3: Remove the stray fence and orphaned period

Delete the empty ```` ``` ```` / ```` ``` ```` pair at the end of the file (lines 360–362) and join the orphaned "." at line 42 onto the previous line.

**Verify**: `tail -5 README.md` → no empty code fence; line 41 region reads as one sentence.

## Test plan

Not applicable (docs only). The greps in each step are the gates.

## Done criteria

- [ ] `grep -n "jfmc" README.md` → no matches
- [ ] `grep -n 'promoted to `_once()`' README.md` → no matches
- [ ] No stray empty code fence at end of file
- [ ] `git diff --stat` shows only `README.md` (plus `plans/README.md` status update)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts above don't match the live README (drift — another plan or the maintainer edited it); re-locate each item before editing, and stop if an item no longer exists.

## Maintenance notes

- If plan 005 lands, the README gains a redaction section — no conflict with these edits, but whoever merges both should re-read the "Overriding the Default Caching Behaviour" area once.
