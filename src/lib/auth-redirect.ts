export const DEFAULT_AUTH_REDIRECT = "/learn";

const PARSE_BASE = "http://redirect.invalid";

// Returns a same-origin path (with query and hash), or the default for anything else.
// The parsed result is checked, not the raw string, so tabs, backslashes and dot-segments
// cannot smuggle in a protocol-relative "//host" destination.
export function safeRedirectPath(value: string | null | undefined): string {
    if (!value?.startsWith("/")) return DEFAULT_AUTH_REDIRECT;

    let url: URL;
    try {
        url = new URL(value, PARSE_BASE);
    } catch {
        return DEFAULT_AUTH_REDIRECT;
    }

    if (url.origin !== PARSE_BASE || url.pathname.startsWith("//")) return DEFAULT_AUTH_REDIRECT;
    return url.pathname + url.search + url.hash;
}

export function authCallbackUrl(origin: string, redirect: string | null): string {
    const callback = new URL("/auth/callback", origin);
    const next = safeRedirectPath(redirect);
    if (next !== DEFAULT_AUTH_REDIRECT) callback.searchParams.set("next", next);
    return callback.toString();
}
