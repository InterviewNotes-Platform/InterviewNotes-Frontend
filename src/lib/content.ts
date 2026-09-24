import { createClient } from '@/lib/supabase/server';

export interface ChapterFrontmatter {
   title?: string;
   description?: string;
   tags?: Array<{ label: string; icon?: string }>;
   difficulty?: "easy" | "medium" | "hard";
   companies?: Array<{ name: string; fallback: string; imageSrc?: string }>;
   author?: string;
   publishedDate?: string;
   [key: string]: unknown;
}

export interface ChapterContent {
   content: string;
   data: ChapterFrontmatter;
}

/**
 * Why the chapter body is or isn't available.
 *
 * - `ok`              body present, render it
 * - `empty`           chapter exists but has not been ingested from Notion yet
 * - `unauthenticated` premium chapter, no valid session (API 401)
 * - `unentitled`      premium chapter, signed in but no entitlement (API 402)
 * - `notFound`        no such chapter (API 404)
 */
export type ChapterStatus =
   | "ok"
   | "empty"
   | "unauthenticated"
   | "unentitled"
   | "notFound";

export interface ChapterResult extends ChapterContent {
   status: ChapterStatus;
}

interface ChapterContentResponse {
   chapter_id: string;
   title: string;
   body_markdown: string | null;
   body_blocks: unknown[];
   updated_at: string;
}

/** How long an unauthenticated chapter response may be cached at the edge. */
const REVALIDATE_SECONDS = 60;

function apiUrl(): string {
   const url = process.env.API_URL;
   if (!url) {
      // No silent fallback to the filesystem — that is the leak we just closed.
      throw new Error(
         "Missing API_URL env var. Set it in .env.local (see .env.example) to the " +
         "InterviewNotes API base URL, e.g. https://interviewnotes-api.up.railway.app"
      );
   }
   return url.replace(/\/$/, "");
}

/**
 * Reads the caller's Supabase access token, if they have a session.
 *
 * Returns null rather than throwing when Supabase is unreachable or
 * unconfigured: a signed-out reader should still get free chapters.
 */
async function getAccessToken(): Promise<string | null> {
   try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
   } catch (error) {
      console.error("Could not read Supabase session:", error);
      return null;
   }
}

/**
 * Fetches a chapter body from the API.
 *
 * Premium chapters are gated server-side: the API decides, not this function.
 * A 401/402 comes back as a status the page renders as a paywall, never as a
 * 404 — a reader who hits a premium chapter should be told to sign in or
 * subscribe, not told the page does not exist.
 */
export async function getChapterContent(
   courseSlug: string,
   chapterSlug: string
): Promise<ChapterResult> {
   const token = await getAccessToken();
   const url = `${apiUrl()}/content/courses/${encodeURIComponent(courseSlug)}/chapters/${encodeURIComponent(chapterSlug)}`;

   let response: Response;
   try {
      response = await fetch(url, {
         headers: token ? { Authorization: `Bearer ${token}` } : {},
         // A response for a signed-in reader is user-specific, so it must not
         // be shared in the edge cache. Anonymous reads are safe to cache.
         ...(token
            ? { cache: "no-store" as const }
            : { next: { revalidate: REVALIDATE_SECONDS } }),
      });
   } catch (error) {
      console.error(`Chapter fetch failed for ${courseSlug}/${chapterSlug}:`, error);
      throw new Error(
         `Could not reach the content API at ${apiUrl()}. Is it running?`
      );
   }

   if (response.status === 401) return gated("unauthenticated");
   if (response.status === 402) return gated("unentitled");
   if (response.status === 404) return gated("notFound");

   if (!response.ok) {
      throw new Error(
         `Content API returned ${response.status} for ${courseSlug}/${chapterSlug}`
      );
   }

   const payload = (await response.json()) as ChapterContentResponse;
   const markdown = payload.body_markdown?.trim();

   if (!markdown) {
      return { status: "empty", content: "", data: { title: payload.title } };
   }

   return {
      status: "ok",
      content: payload.body_markdown as string,
      data: { title: payload.title },
   };
}

function gated(status: ChapterStatus): ChapterResult {
   return { status, content: "", data: {} };
}
