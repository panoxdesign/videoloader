import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import type { Metadata } from "next";
import { texts } from "@/lib/texts";
import { themeScript } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: texts.appName,
  description: texts.appDescription,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Das Theme-Script setzt `.dark` und `color-scheme` vor der Hydration.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
