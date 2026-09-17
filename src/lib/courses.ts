import { unstable_cache } from "next/cache";

/**
 * Course and chapter metadata, read from the API.
 *
 * This replaced a 2,788-line hard-coded array in `data.ts`. Postgres is now
 * the single source of truth — the array had already drifted (29 chapters
 * carried a `courseId` naming a course that no longer existed), which is
 * exactly the failure mode a second source of truth produces.
 *
 * Server-only: every export here runs during a server render.
 */

export interface Chapter {
   id: string;
   title: string;
   slug: string;
   courseId: string;
   section: string;
   order: number;
   isPremium: boolean;
   estimatedReadTime: number;
   isCompleted?: boolean;
}

export interface Course {
   id: string;
   title: string;
   slug: string;
   description: string;
   icon: string;
   chapterCount: number;
   chapters: Chapter[];
   disabled?: boolean;
}

/**
 * Courses hidden from `/learn` while their content is still being written.
 *
 * This is a presentation decision, not a property of the content, so it lives
 * here rather than in the database. Drop a slug from this list to publish it.
 */
export const DISABLED_COURSE_SLUGS = new Set<string>([
   "low-level-design",
   "system-design-fundamentals",
   "system-design-interviews",
   "frontend-system-design",
   "staff-plus-design",
   "behavioral-interviews",
]);

/** Course metadata changes rarely; a five-minute window is plenty. */
const REVALIDATE_SECONDS = 300;

interface ChapterResponse {
   id: string;
   course_id: string;
   slug: string;
   title: string;
   section: string;
   order: number;
   is_premium: boolean;
   estimated_read_time: number;
}

interface CourseResponse {
   id: string;
   slug: string;
   title: string;
   description: string;
   icon: string;
   chapter_count: number;
   chapters: ChapterResponse[];
}

function apiUrl(): string {
   const url = process.env.API_URL;
   if (!url) {
      throw new Error(
         "Missing API_URL env var. Set it in .env.local (see .env.example) to the " +
         "InterviewNotes API base URL, e.g. http://localhost:8000"
      );
   }
   return url.replace(/\/$/, "");
}

function toChapter(raw: ChapterResponse): Chapter {
   return {
      id: raw.id,
      courseId: raw.course_id,
      slug: raw.slug,
      title: raw.title,
      section: raw.section,
      order: raw.order,
      isPremium: raw.is_premium,
      estimatedReadTime: raw.estimated_read_time,
   };
}

function toCourse(raw: CourseResponse): Course {
   return {
      id: raw.id,
      slug: raw.slug,
      title: raw.title,
      description: raw.description,
      icon: raw.icon,
      chapterCount: raw.chapter_count,
      chapters: raw.chapters.map(toChapter).sort((a, b) => a.order - b.order),
      disabled: DISABLED_COURSE_SLUGS.has(raw.slug),
   };
}

/**
 * All courses with their chapter metadata. No bodies — this endpoint is
 * deliberately unauthenticated and carries no chapter content.
 */
const fetchCourses = unstable_cache(
   async (): Promise<Course[]> => {
      const response = await fetch(`${apiUrl()}/content/courses`, {
         next: { revalidate: REVALIDATE_SECONDS },
      });

      if (!response.ok) {
         throw new Error(`Content API returned ${response.status} for /content/courses`);
      }

      const payload = (await response.json()) as CourseResponse[];
      return payload.map(toCourse);
   },
   ["content-courses"],
   { revalidate: REVALIDATE_SECONDS, tags: ["content-courses"] }
);

export async function getCourses(): Promise<Course[]> {
   try {
      return await fetchCourses();
   } catch (error) {
      console.error("Could not load courses from the API:", error);
      throw new Error(
         `Could not reach the content API at ${apiUrl()}. Is it running?`
      );
   }
}

/** Courses shown on `/learn` — published only. */
export async function getVisibleCourses(): Promise<Course[]> {
   return (await getCourses()).filter((course) => !course.disabled);
}

export async function getCourse(slug: string): Promise<Course | undefined> {
   return (await getCourses()).find((course) => course.slug === slug);
}

export async function getChapter(
   courseSlug: string,
   chapterSlug: string
): Promise<Chapter | undefined> {
   const course = await getCourse(courseSlug);
   return course?.chapters.find((chapter) => chapter.slug === chapterSlug);
}

/** Pure — groups an already-loaded course's chapters by section, in order. */
export function getGroupedChapters(course: Course): Record<string, Chapter[]> {
   return course.chapters.reduce((acc, chapter) => {
      (acc[chapter.section] ||= []).push(chapter);
      return acc;
   }, {} as Record<string, Chapter[]>);
}
