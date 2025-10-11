import type { FMCCacheContent } from "./cache.js";

const textMimeWhitelist = {
  application: ["json", "javascript", "xml", "xhtml+xml", "ld+json"],
  image: ["svg+xml"],
  text: ["*"],
};

export type SerializedBody =
  | { bodyText: string }
  | { bodyJson: object }
  | { bodyBase64: string }
  | { body: null };

function isTextMime(contentType: string): boolean {
  const [type, subtype] = contentType.split("/");
  if (type in textMimeWhitelist) {
    const subtypes = textMimeWhitelist[type as keyof typeof textMimeWhitelist];
    return subtypes.includes("*") || subtypes.includes(subtype);
  }
  return false;
}

function uint8ToBase64(u8: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < u8.length; i += chunkSize) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

const fatalTextDecoder = new TextDecoder("utf-8", { fatal: true });

export async function serializeBody(
  response: Response | Request,
): Promise<SerializedBody> {
  if (response.body === null) return { body: null };

  const contentType = response.headers.get("content-type")?.split(";")[0] || "";

  // Possibly consider honoring this but maybe more useful for our use case to inspect
  const _nosniff =
    response.headers.get("x-content-type-options")?.toLowerCase() === "nosniff";

  if (contentType === "application/json") {
    return response.json().then((bodyJson) => ({ bodyJson }));
  } else if (isTextMime(contentType)) {
    return response.text().then((bodyText) => ({ bodyText }));
  }

  // Try for text, otherwise encode the bytes as base64
  const buffer = await response.arrayBuffer();
  const u8 = new Uint8Array(buffer);

  // Easy check - any null bytes?
  if (u8.indexOf(0) !== -1) {
    return { bodyBase64: uint8ToBase64(u8) };
  }

  let bodyText = "";
  try {
    bodyText = fatalTextDecoder.decode(u8);
  } catch {
    return { bodyBase64: uint8ToBase64(u8) };
  }

  for (let i = 0; i < bodyText.length; i++) {
    const charCode = bodyText.charCodeAt(i);
    // Control characters except for common whitespace
    if (
      (charCode <= 0x1f &&
        charCode !== 0x09 &&
        charCode !== 0x0a &&
        charCode !== 0x0d) ||
      charCode === 0x7f
    ) {
      return { bodyBase64: uint8ToBase64(u8) };
    }
  }

  return { bodyText };
}

export async function deserializeBody(
  objWithBody: FMCCacheContent["response"] | FMCCacheContent["request"],
): Promise<BodyInit | null> {
  if ("body" in objWithBody) {
    if (objWithBody.body === null) {
      return null;
    } else {
      throw new Error("Invalid body: null expected");
    }
  } else if ("bodyText" in objWithBody) {
    return objWithBody.bodyText;
  } else if ("bodyJson" in objWithBody) {
    return JSON.stringify(objWithBody.bodyJson);
  } else if ("bodyBase64" in objWithBody) {
    const binary = atob(objWithBody.bodyBase64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return null;
}
