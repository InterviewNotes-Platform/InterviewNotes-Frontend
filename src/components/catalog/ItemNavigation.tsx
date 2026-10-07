import type { ItemNavigation as ItemNavigationData } from "@/lib/catalog/navigation";
import { cn } from "@/lib/utils";
import { RelatedContent } from "./RelatedContent";
import { AlternateTracks, TrackPrevNext } from "./TrackContext";
import { ModuleNavigation, TrackOutline } from "./TrackOutline";

/** The Track's whole outline as a collapsed disclosure. `reading` is the Lesson's open presentation and never prefetches. */
export function FullOutline({ navigation, reading = false }: { navigation: ItemNavigationData; reading?: boolean }) {
   const { id, home } = navigation;
   if (!home) return null;
   return (
      <details className={reading ? "border-t border-border pt-2" : "rounded-lg border border-border p-4"}>
         <summary className={cn("cursor-pointer font-semibold", reading && "flex min-h-11 items-center")}>
            Full outline of {home.track.title}
         </summary>
         <div className="mt-4">
            <TrackOutline track={home.track} currentId={id} prefetch={reading ? false : undefined} />
         </div>
      </details>
   );
}

/**
 * Where an item sits in its home Track: previous/next, the module's members, the full outline. `reading` is the
 * Problem page's presentation of the same links and keeps every one of them from prefetching. Nothing without a home Track.
 */
export function CurriculumNavigation({ navigation, reading = false }: { navigation: ItemNavigationData; reading?: boolean }) {
   const { id, home } = navigation;
   if (!home) return null;
   return (
      <>
         <TrackPrevNext placement={home} reading={reading} />
         <ModuleNavigation module={home.module} currentId={id} prefetch={reading ? false : undefined} quiet={reading} />
         <FullOutline navigation={navigation} reading={reading} />
      </>
   );
}

/** Everything below an item's content: Track navigation, then related content. Sections may be absent. */
export function ItemNavigation({ navigation }: { navigation: ItemNavigationData }) {
   const { alternates, relations } = navigation;
   return (
      <div className="mt-16 space-y-12 border-t border-border pt-12 empty:hidden">
         <CurriculumNavigation navigation={navigation} />
         <RelatedContent relations={relations} />
         <AlternateTracks placements={alternates} />
      </div>
   );
}
