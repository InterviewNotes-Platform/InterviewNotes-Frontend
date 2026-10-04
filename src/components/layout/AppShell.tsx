import { Header } from "@/components/layout/Header";

export const MAIN_CONTENT_ID = "main-content";

/** Skip link, header and a focus target around the page; each page keeps its own `<main>`. */
export function AppShell({ children }: { children: React.ReactNode }) {
    return (
        <>
            <a
                href={`#${MAIN_CONTENT_ID}`}
                className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-[60] focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-supporting focus:font-medium"
            >
                Skip to content
            </a>
            <Header />
            <div id={MAIN_CONTENT_ID} tabIndex={-1} className="scroll-mt-16 outline-none">
                {children}
            </div>
        </>
    );
}
