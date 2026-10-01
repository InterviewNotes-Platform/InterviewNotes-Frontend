import type { ItemNavigation as ItemNavigationData } from "@/lib/catalog/navigation";
import { RelatedContent } from "./RelatedContent";
import { AlternateTracks, TrackPrevNext } from "./TrackContext";
import { ModuleNavigation, TrackOutline } from "./TrackOutline";

/** Everything below an item's content: Track navigation, then related content. Sections may be absent. */
export function ItemNavigation({ navigation }: { navigation: ItemNavigationData }) {
   const { id, home, alternates, relations } = navigation;
   return (
      <div className="mt-10 space-y-8">
         {home ? (
            <>
               <TrackPrevNext placement={home} />
               <ModuleNavigation module={home.module} currentId={id} />
               <details className="border border-border p-4">
                  <summary className="cursor-pointer font-semibold text-foreground">
                     Full outline of {home.track.title}
                  </summary>
                  <div className="mt-4">
                     <TrackOutline track={home.track} currentId={id} />
                  </div>
               </details>
            </>
         ) : null}
         <RelatedContent relations={relations} />
         <AlternateTracks placements={alternates} />
      </div>
   );
}
