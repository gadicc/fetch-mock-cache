/*
 * Headers need special handling for "set-cookie" headers.
 * Node v19.7.0+ has a `getSetCookie` method on the Headers class.
 * node-fetch v3.0.0+ has a `raw` method on the Headers class.
 * In browser environments its irrelevant.
 */

export function serializeHeaders(headers: Headers) {
  const serialized = Object.fromEntries(headers.entries());

  if (serialized["set-cookie"]) {
    // @ts-expect-error: only in node 19.7.0+
    if (typeof headers.getSetCookie === "function") {
      // @ts-expect-error: no type guard for typeof === "function"
      serialized["set-cookie"] = headers.getSetCookie();

      // @ts-expect-error: node-fetch package
    } else if (typeof headers.raw === "function") {
      // @ts-expect-error: no type guard for typeof === "function"
      serialized["set-cookie"] = headers.raw()["set-cookie"];
    }
  }

  return serialized;
}

export function unserializeHeaders(
  serialized: Record<string, string | string[]>,
) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(serialized)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }
  return headers;
}
