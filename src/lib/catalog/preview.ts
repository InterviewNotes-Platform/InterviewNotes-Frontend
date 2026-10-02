import "server-only";

// D9: the API serves a non-production catalog only to this server, which proves itself with a shared
// secret in this header. Production holds no secret, so holding it is what makes a deployment a preview.
const PREVIEW_HEADER = "X-Preview-Token";
const MIN_TOKEN_LENGTH = 32;
const VISIBLE_ASCII = /^[\x21-\x7e]+$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface PreviewDelivery {
   /** Sent with every catalog request; empty in production. */
   headers: Record<string, string>;
   /** Only production answers may be cached; a preview answer is private to this server. */
   shareable: boolean;
}

/** Whether this deployment is a preview. A deployment property, never derived from a request. */
export function isPreview(): boolean {
   return Boolean(process.env.CATALOG_PREVIEW_TOKEN);
}

/** The secret only ever travels over https, or to a server on this machine. */
function isTrustedTransport(apiBase: string): boolean {
   try {
      const { protocol, hostname } = new URL(apiBase);
      return protocol === "https:" || (protocol === "http:" && LOOPBACK_HOSTS.has(hostname));
   } catch {
      return false;
   }
}

/**
 * What the API requires of this deployment's catalog requests, or null when a preview cannot send
 * them safely (a malformed secret, or a transport that would expose it). The caller then makes
 * no request at all: it never retries without the secret and never reaches for another API.
 */
export function previewDelivery(apiBase: string): PreviewDelivery | null {
   const token = process.env.CATALOG_PREVIEW_TOKEN;
   if (!token) return { headers: {}, shareable: true };
   if (token.length < MIN_TOKEN_LENGTH || !VISIBLE_ASCII.test(token) || !isTrustedTransport(apiBase)) return null;
   return { headers: { [PREVIEW_HEADER]: token }, shareable: false };
}
