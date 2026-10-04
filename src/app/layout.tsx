import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "InterviewNotes - Ace Your Tech Interviews",
  description: "The complete interview prep platform for SDE 3, Staff & Principal roles. Master System Design, ML System Design, LLD, and more.",
  keywords: ["System Design Interview", "ML System Design", "LLD", "Tech Interview Prep", "Staff Engineer"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="font-sans antialiased min-h-screen bg-background"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
