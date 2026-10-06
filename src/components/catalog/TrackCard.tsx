import type { CatalogTrackSummary } from "@/lib/catalog/types";
import { DiscoveryCard } from "./DiscoveryCard";

/** A discovery surface for one Track: its title and summary from the list response, linking to the Track. */
export function TrackCard({ track, href }: { track: CatalogTrackSummary; href: string }) {
   return <DiscoveryCard title={track.title} summary={track.summary} href={href} cue="Open Track" />;
}
