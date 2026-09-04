import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Starfield from "@/components/Starfield";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  style: ["normal", "italic"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Innovate To Escape — Prodinno Club",
  description:
    "A Wordle challenge by the Prodinno Club. Guess the word, escape the puzzle, climb the leaderboard.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0A0A",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>
        <ClerkProvider afterSignOutUrl="/">
          <Starfield />
          <Header />
          <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-6 sm:px-8">
            {children}
          </main>
          <footer className="mx-auto w-full max-w-6xl px-5 pb-10 pt-6 text-center text-xs text-white/40 sm:px-8">
            Built for the Prodinno Club • Innovate To Escape
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}
