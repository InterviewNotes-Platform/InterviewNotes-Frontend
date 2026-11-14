import localFont from "next/font/local";

// Inter, self-hosted from the prototype's build assets (latin subset, SIL OFL) so nothing is fetched at build or run time.
// The homepage's <main> carries its variable, so no other route loads or uses it. Headings use the system serif (P8-D-073).
export const homeSans = localFont({ src: "./fonts/inter-variable-latin.woff2", weight: "100 900", display: "swap", variable: "--font-home-sans", fallback: ["Arial", "sans-serif"] });

export const HOME_FONT_VARIABLES = homeSans.variable;
