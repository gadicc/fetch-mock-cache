# Plan 004: Fall back to text when a JSON-labelled body doesn't parse

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 16ce139..HEAD -- src/body.ts src/body.spec.ts README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-offline-deterministic-tests.md (soft — needed for offline test runs)
- **Category**: bug
- **Planned at**: commit `16ce139`, 2026-07-05

## Why this matters

If a server responds with `content-type: application/json` but a body that isn't valid JSON (truncated proxy responses, HTML error pages mislabelled by gateways — common in the wild), `serializeBody` calls `response.json()`, which throws, and the entire mocked `fetch()` rejects with a parse error instead of returning the response. The same applies to *request* bodies labelled JSON. The README's TODO list already acknowledges this ("Handle and store invalid JSON too?"). The fix is to parse defensively and store unparseable bodies as `bodyText`, which the deserializer already round-trips correctly.

## Current state

- `src/body.ts` — the serializer:

  ```ts
  // src/body.ts:46-50
  if (contentType === "application/json") {
    return response.json().then((bodyJson) => ({ bodyJson }));
  } else if (isTextMime(contentType)) {
    return response.text().then((bodyText) => ({ bodyText }));
  }
  ```

  Note `isTextMime` (`src/body.ts:15-22`) already treats `application/json` as text-ish via the whitelist, so the fallback representation (`bodyText`) is natural.

- `src/body.ts:85-108` — `deserializeBody` returns `objWithBody.bodyText` as-is for `bodyText` entries; a stored invalid-JSON body will replay byte-identically.

- `src/body.spec.ts` — unit tests for serialize/deserialize; house pattern to copy (e.g. lines 16–24, "serializeBody with JSON").

- `README.md:358` — the TODO checkbox: `- [ ] Handle and store invalid JSON too?`

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Tests     | `pnpm test`              | all pass            |
| Lint      | `pnpm lint`              | exit 0              |

## Scope

**In scope**:
- `src/body.ts` (the `application/json` branch only)
- `src/body.spec.ts` (new tests)
- `README.md` (tick the TODO checkbox — one line)

**Out of scope**:
- The binary/text sniffing logic further down `serializeBody` (lines 52–82) — unrelated.
- `deserializeBody` — no change needed.
- JSON *request* key hashing in `src/store.ts` — unaffected (it hashes whatever representation was stored).

## Git workflow

- Branch: `advisor/004-invalid-json-fallback`
- Commit: `fix(body): store unparseable JSON-labelled bodies as text instead of throwing`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Parse defensively

Replace the `application/json` branch in `src/body.ts` with:

```ts
if (contentType === "application/json") {
  const bodyText = await response.text();
  try {
    return { bodyJson: JSON.parse(bodyText) };
  } catch {
    return { bodyText };
  }
}
```

Behavior notes that must hold:
- Valid JSON keeps producing `bodyJson` (existing fixtures and cache files remain valid — no format change).
- Invalid JSON produces `bodyText` with the raw body.

**Verify**: `pnpm exec tsc --noEmit` → exit 0; `pnpm test` → all existing body tests pass.

### Step 2: Add tests

In `src/body.spec.ts`, following the existing test style:

```ts
it("serializeBody with invalid JSON falls back to text", async () => {
  const body = "<html>502 Bad Gateway</html>";
  const serialized = await serializeBody(
    new Response(body, { headers: { "Content-Type": "application/json" } }),
  );
  expect(serialized).toEqual({ bodyText: body });
});
```

Add a second case with an empty-string body (`new Response("", { headers: { "Content-Type": "application/json" } })`) — `JSON.parse("")` throws, so it must serialize as `{ bodyText: "" }`, not crash. (Note: `new Response("")` has a non-null body, unlike `new Response(null)`, so it reaches the JSON branch.)

**Verify**: `pnpm test` → all pass including the 2 new tests.

### Step 3: Update the README TODO

Change `- [ ] Handle and store invalid JSON too?` to `- [x] Handle and store invalid JSON too?` in `README.md`.

**Verify**: `grep -n "Handle and store invalid JSON" README.md` → shows `[x]`.

## Test plan

- Two new unit tests in `src/body.spec.ts` (Step 2), patterned on `src/body.spec.ts:16-24`.
- Round-trip check is implicitly covered by the existing `deserializeBody with text` test.
- Verification: `pnpm test` → exit 0.

## Done criteria

- [ ] `grep -n "response.json()" src/body.ts` → no matches
- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `pnpm test` exits 0; both new tests pass
- [ ] `pnpm lint` exits 0
- [ ] No files outside the in-scope list modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The `application/json` branch at `src/body.ts:46-47` doesn't match the excerpt (drift).
- Any existing fixture-based test starts failing — this change must not alter the serialization of *valid* JSON.

## Maintenance notes

- If a future change wants to preserve the "this claimed to be JSON but wasn't" signal (e.g. for a lint/warn mode), it would need a distinct field; today's fallback silently degrades to `bodyText`, which is fine for replay fidelity.
- Reviewer: confirm no double-read of the body (the old code let `response.json()` consume it; the new code must call `response.text()` exactly once).
