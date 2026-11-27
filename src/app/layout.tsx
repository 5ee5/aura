import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Semi_Condensed } from "next/font/google";
import "./globals.css";

// Downloaded at build time and served by the app itself.
const body = Barlow({ subsets: ["latin", "latin-ext"], weight: ["400", "500"], variable: "--font-body" });
const heading = Barlow_Semi_Condensed({
  subsets: ["latin", "latin-ext"],
  weight: "600",
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: { default: "Aura", template: "%s · Aura" },
  description: "Personal AI running coach",
};

export const viewport: Viewport = {
  themeColor: "#0c0e11",
  // The on-screen keyboard shrinks the page instead of covering the message box.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
