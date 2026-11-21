/**
 * The Prepare journey's own pair of servers (P8-PREP-UX-02): a catalog double holding the behavioral Lessons, and the reader build
 * (Prepare flag on) served again with its `API_URL` at that double. The browser's Prepare API is answered inside each test, so
 * nothing here keeps a log that another test could read.
 */
export const PREPARE_API_PORT = 3191;
export const PREPARE_PORT = 3192;
export const PREPARE_API_ORIGIN = `http://127.0.0.1:${PREPARE_API_PORT}`;
export const PREPARE_ORIGIN = `http://localhost:${PREPARE_PORT}`;
