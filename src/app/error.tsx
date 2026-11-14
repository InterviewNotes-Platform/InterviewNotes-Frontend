"use client";

import Link from "next/link";
import { StatusPage } from "@/components/layout/StatusPage";
import { Button } from "@/components/ui/button";
import { TRACKS_INDEX_HREF } from "@/lib/primary-navigation";

/**
 * The last-resort boundary for a page that throws while rendering. It shows no error text: the cause stays in the server logs.
 * Next 16.3 passes `retry` (re-fetch and re-render; the documented default) and `reset` (clears the boundary only).
 */
export default function RouteError({ retry }: { retry: () => void }) {
   return (
      <StatusPage alert title="Something went wrong on our side" actions={
         <>
            <Button type="button" onClick={() => retry()} className="bg-foreground text-background hover:bg-foreground/90">
               Try again
            </Button>
            <Button asChild variant="outline">
               <Link href="/">Go to the homepage</Link>
            </Button>
            <Button asChild variant="outline">
               <Link href={TRACKS_INDEX_HREF}>Browse Tracks</Link>
            </Button>
         </>
      }>
         This page could not be displayed. Try again, or head somewhere else.
      </StatusPage>
   );
}
