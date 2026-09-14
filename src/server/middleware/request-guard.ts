/**
 * Request admission guards.
 *
 * Bodies are bounded before parsing so a large payload cannot be turned into
 * work. The origin check rejects cross-site browser POSTs; it is a hardening
 * measure, not authentication, and a non-browser client sends no Origin header
 * at all.
 */

export const MAX_BODY_BYTES = 16 * 1024;

export type BodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly message: string };

export function isCrossOriginBrowserRequest(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (origin === null) return false;
  try {
    return new URL(origin).origin !== new URL(request.url).origin;
  } catch {
    return true;
  }
}

export async function readJsonBody(request: Request): Promise<BodyResult> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      message: "Requests must use Content-Type: application/json.",
    };
  }

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const declared = Number.parseInt(declaredLength, 10);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return {
        ok: false,
        message: `Request body exceeds the ${MAX_BODY_BYTES} byte limit.`,
      };
    }
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return {
      ok: false,
      message: `Request body exceeds the ${MAX_BODY_BYTES} byte limit.`,
    };
  }
  if (text.trim() === "") {
    return { ok: false, message: "Request body is empty." };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, message: "Request body is not valid JSON." };
  }
}
