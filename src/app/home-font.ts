import localFont from "next/font/local";

// The prototype's three faces, self-hosted from its own build assets (latin subset, SIL OFL) so nothing is fetched at build or run time.
// The homepage's <main> carries their variables, so no other route loads or uses them.
export const homeSerif = localFont({ src: "./fonts/newsreader-400-latin.woff2", weight: "400", display: "swap", variable: "--font-home-serif", fallback: ["Georgia", "serif"] });
export const homeSans = localFont({ src: "./fonts/inter-variable-latin.woff2", weight: "100 900", display: "swap", variable: "--font-home-sans", fallback: ["Arial", "sans-serif"] });
export const homeMono = localFont({ src: "./fonts/jetbrains-mono-variable-latin.woff2", weight: "100 800", display: "swap", variable: "--font-home-mono", preload: false, fallback: ["ui-monospace", "monospace"] });

export const HOME_FONT_VARIABLES = `${homeSerif.variable} ${homeSans.variable} ${homeMono.variable}`;
