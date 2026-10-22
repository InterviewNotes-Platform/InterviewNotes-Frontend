import localFont from "next/font/local";

// The prototype's hero serif (Newsreader 400, latin subset; SIL OFL), self-hosted so a build never fetches fonts.
export const homeSerif = localFont({ src: "./fonts/newsreader-400-latin.woff2", weight: "400", display: "swap", variable: "--font-home-serif", fallback: ["Georgia", "serif"] });
