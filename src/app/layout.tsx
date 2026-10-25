import type { Metadata } from "next";
import { texts } from "@/lib/texts";
import "./globals.css";

export const metadata: Metadata = {
  title: texts.appName,
  description: texts.appDescription,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
