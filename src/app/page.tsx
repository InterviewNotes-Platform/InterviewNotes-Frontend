import type { Metadata } from "next";
import { HomeContent } from "./HomeContent";
import { HOME_METADATA } from "./home-copy";

export const metadata: Metadata = HOME_METADATA;

/** Static and presentation-only: it reads no catalog or course data, so it renders whatever the API is doing. */
export default function HomePage() {
   return <HomeContent />;
}
