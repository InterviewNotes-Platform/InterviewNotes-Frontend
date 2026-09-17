import fs from 'fs';
import path from 'path';

/**
 * Course metadata for the offline scaffolding scripts.
 *
 * These scripts used to import the `courses` array from `src/lib/data.ts`.
 * That array is gone — Postgres is the source of truth now and the app reads
 * it through the API. The scripts run offline (no server, no DB), so they read
 * the same checked-in JSON the backend seeds from.
 *
 * Regenerate that file from the database rather than editing it by hand.
 */

export interface ScaffoldChapter {
   id: string;
   title: string;
   slug: string;
   courseId: string;
   section: string;
   order: number;
   isPremium: boolean;
   estimatedReadTime: number;
}

export interface ScaffoldCourse {
   id: string;
   title: string;
   slug: string;
   description: string;
   icon: string;
   chapterCount: number;
   chapters: ScaffoldChapter[];
   disabled?: boolean;
}

const SEED_JSON = path.join(
   process.cwd(),
   '..',
   'backend',
   'app',
   'seed_data',
   'courses.json'
);

export function loadCourses(): ScaffoldCourse[] {
   if (!fs.existsSync(SEED_JSON)) {
      throw new Error(
         `Course seed data not found at ${SEED_JSON}. These scripts read the ` +
         `backend's seed file; run them from fullstack/frontend with the ` +
         `backend checked out alongside.`
      );
   }
   return JSON.parse(fs.readFileSync(SEED_JSON, 'utf-8')) as ScaffoldCourse[];
}

export const courses: ScaffoldCourse[] = loadCourses();
