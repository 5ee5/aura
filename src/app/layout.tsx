import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura",
  description: "Personal AI running coach",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
