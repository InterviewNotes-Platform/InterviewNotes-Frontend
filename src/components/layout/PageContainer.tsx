import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type DivProps = Omit<ComponentProps<"div">, "ref">;

/** The page-width box: max ~1280px with 16 / 24 / 32px gutters. A page's outermost container is its `main`. */
export function PageContainer({ as: Tag = "div", className, ...props }: DivProps & { as?: "div" | "main" }) {
   return <Tag className={cn("mx-auto w-full max-w-page px-4 md:px-6 lg:px-8", className)} {...props} />;
}

/** The reading measure (~736px). On narrow screens it is the viewport minus the container's gutters. */
export function ReadingColumn({ className, ...props }: DivProps) {
   return <div className={cn("mx-auto w-full max-w-reading", className)} {...props} />;
}
