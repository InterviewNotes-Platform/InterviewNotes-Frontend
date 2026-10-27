import {
   isAnswer,
   isDeleteAll,
   isExport,
   isLink,
   isPage,
   isPreference,
   isRecord,
   isStory,
   readIssues,
} from "./guards";
import type {
   Answer,
   AnswerCreate,
   AnswerListParams,
   AnswerUpdate,
   DeleteAllSummary,
   Link,
   Page,
   Preference,
   PreferenceUpdate,
   PrepExport,
   PrepResult,
   Story,
   StoryCreate,
   StoryListParams,
   StoryUpdate,
} from "./types";

/** Browser-to-API timeout for personal-data calls (contract §8.1); a starting value, not a measurement. */
export const PERSONAL_DATA_TIMEOUT_MS = 60_000;

export type PrepClientConfig = {
   /** The API origin as the browser reaches it. The caller supplies it; this module reads no environment. */
   baseUrl: string;
   /** The signed-in user's Supabase access token, or null when signed out. Called per request, never stored. */
   getAccessToken: () => Promise<string | null>;
   fetch?: typeof fetch;
   timeoutMs?: number;
};

type Reader<T> = (response: Response) => Promise<{ value: T } | null>;

type Call = { method: string; path: string; body?: unknown; accept?: string };

function jsonReader<T>(isValid: (body: unknown) => body is T): Reader<T> {
   return async (response) => {
      try {
         const body: unknown = await response.json();
         return isValid(body) ? { value: body } : null;
      } catch {
         return null;
      }
   };
}

const textReader: Reader<string> = async (response) => {
   try {
      return { value: await response.text() };
   } catch {
      return null;
   }
};

const noContent: Reader<void> = async () => ({ value: undefined });

function query(params: Record<string, string | number | string[] | undefined>): string {
   const search = new URLSearchParams();
   for (const [name, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : [value]) {
         if (item !== undefined && item !== "") search.append(name, String(item));
      }
   }
   const text = search.toString();
   return text ? `?${text}` : "";
}

const id = encodeURIComponent;

/** A typed client for `/me/prep`. It sends the user's bearer token and nothing else; it stores nothing. */
export function createPrepClient(config: PrepClientConfig) {
   const base = config.baseUrl.replace(/\/$/, "");
   const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
   const timeoutMs = config.timeoutMs ?? PERSONAL_DATA_TIMEOUT_MS;

   async function call<T>({ method, path, body, accept }: Call, read: Reader<T>): Promise<PrepResult<T>> {
      const token = await config.getAccessToken().catch(() => null);
      if (!token) return { status: "unauthenticated" };

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
         timedOut = true;
         controller.abort();
      }, timeoutMs);
      try {
         let response: Response;
         try {
            response = await doFetch(`${base}/me/prep${path}`, {
               method,
               headers: {
                  Authorization: `Bearer ${token}`,
                  Accept: accept ?? "application/json",
                  ...(body === undefined ? {} : { "Content-Type": "application/json" }),
               },
               body: body === undefined ? undefined : JSON.stringify(body),
               cache: "no-store",
               credentials: "omit",
               signal: controller.signal,
            });
         } catch {
            return { status: "unavailable", cause: timedOut ? "timeout" : "transport" };
         }
         return await interpret(response, read);
      } catch {
         return { status: "unavailable", cause: timedOut ? "timeout" : "transport" };
      } finally {
         clearTimeout(timer);
      }
   }

   async function interpret<T>(response: Response, read: Reader<T>): Promise<PrepResult<T>> {
      if (response.status === 401) return { status: "unauthenticated" };
      if (response.status === 404) return { status: "notFound" };
      if (response.status === 409 || response.status === 422) return interpretRejection(response);
      if (!response.ok) return { status: "unavailable", cause: "upstream" };
      const result = await read(response);
      return result ? { status: "ok", data: result.value } : { status: "unavailable", cause: "malformed" };
   }

   async function interpretRejection<T>(response: Response): Promise<PrepResult<T>> {
      const upstream: PrepResult<T> = { status: "unavailable", cause: "upstream" };
      let body: unknown;
      try {
         body = await response.json();
      } catch {
         return upstream;
      }
      if (!isRecord(body)) return upstream;
      if (response.status === 409) {
         const current = body.current_version;
         return body.code === "version_conflict" && typeof current === "number" && Number.isInteger(current)
            ? { status: "conflict", currentVersion: current }
            : upstream;
      }
      const fields = body.code === "validation_error" ? readIssues(body.fields) : null;
      return fields ? { status: "invalid", fields } : upstream;
   }

   const storyPage = isPage(isStory);
   const answerPage = isPage(isAnswer);

   return {
      listStories: (params: StoryListParams = {}): Promise<PrepResult<Page<Story>>> =>
         call({ method: "GET", path: `/stories${query(params)}` }, jsonReader(storyPage)),
      createStory: (body: StoryCreate): Promise<PrepResult<Story>> =>
         call({ method: "POST", path: "/stories", body }, jsonReader(isStory)),
      getStory: (storyId: string): Promise<PrepResult<Story>> =>
         call({ method: "GET", path: `/stories/${id(storyId)}` }, jsonReader(isStory)),
      updateStory: (storyId: string, body: StoryUpdate): Promise<PrepResult<Story>> =>
         call({ method: "PATCH", path: `/stories/${id(storyId)}`, body }, jsonReader(isStory)),
      deleteStory: (storyId: string): Promise<PrepResult<void>> =>
         call({ method: "DELETE", path: `/stories/${id(storyId)}` }, noContent),
      duplicateStory: (storyId: string): Promise<PrepResult<Story>> =>
         call({ method: "POST", path: `/stories/${id(storyId)}/duplicate` }, jsonReader(isStory)),

      listAnswers: (params: AnswerListParams = {}): Promise<PrepResult<Page<Answer>>> =>
         call({ method: "GET", path: `/answers${query(params)}` }, jsonReader(answerPage)),
      createAnswer: (body: AnswerCreate): Promise<PrepResult<Answer>> =>
         call({ method: "POST", path: "/answers", body }, jsonReader(isAnswer)),
      getAnswer: (answerId: string): Promise<PrepResult<Answer>> =>
         call({ method: "GET", path: `/answers/${id(answerId)}` }, jsonReader(isAnswer)),
      updateAnswer: (answerId: string, body: AnswerUpdate): Promise<PrepResult<Answer>> =>
         call({ method: "PATCH", path: `/answers/${id(answerId)}`, body }, jsonReader(isAnswer)),
      deleteAnswer: (answerId: string): Promise<PrepResult<void>> =>
         call({ method: "DELETE", path: `/answers/${id(answerId)}` }, noContent),
      duplicateAnswer: (answerId: string): Promise<PrepResult<Answer>> =>
         call({ method: "POST", path: `/answers/${id(answerId)}/duplicate` }, jsonReader(isAnswer)),

      /** Idempotent: `created` is false when the pair already existed (200 rather than 201). */
      linkStory: (answerId: string, storyId: string): Promise<PrepResult<{ link: Link; created: boolean }>> =>
         call({ method: "PUT", path: `/answers/${id(answerId)}/stories/${id(storyId)}` }, async (response) => {
            const read = await jsonReader(isLink)(response);
            return read && { value: { link: read.value, created: response.status === 201 } };
         }),
      unlinkStory: (answerId: string, storyId: string): Promise<PrepResult<void>> =>
         call({ method: "DELETE", path: `/answers/${id(answerId)}/stories/${id(storyId)}` }, noContent),

      getPreference: (): Promise<PrepResult<Preference>> =>
         call({ method: "GET", path: "/preferences" }, jsonReader(isPreference)),
      /** The first write sends `version` 0. */
      updatePreference: (body: PreferenceUpdate): Promise<PrepResult<Preference>> =>
         call({ method: "PATCH", path: "/preferences", body }, jsonReader(isPreference)),

      exportJson: (): Promise<PrepResult<PrepExport>> =>
         call({ method: "GET", path: "/export?format=json" }, jsonReader(isExport)),
      exportMarkdown: (): Promise<PrepResult<string>> =>
         call({ method: "GET", path: "/export?format=markdown", accept: "text/markdown" }, textReader),
      deleteAll: (): Promise<PrepResult<DeleteAllSummary>> =>
         call({ method: "POST", path: "/delete-all", body: { confirm: "delete-all" } }, jsonReader(isDeleteAll)),
   };
}

export type PrepClient = ReturnType<typeof createPrepClient>;
