import type { Metadata } from "next";
import { JetBrains_Mono, M_PLUS_1p } from "next/font/google";
import Script from "next/script";

import { createThemeBootstrapScript } from "@/shared/theme/web-theme";
import "./globals.css";

const mainFont = M_PLUS_1p({
  variable: "--font-main",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

const monoFont = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
});

const TITLE_SUFFIX = "はちまきBOT v5 for web";

export const metadata: Metadata = {
  title: {
    default: `トップ | ${TITLE_SUFFIX}`,
    template: `%s | ${TITLE_SUFFIX}`,
  },
  verification: {
    google: "BNUhxfsRYO_rQUoxQSH-o51k3HPzzl7DCfDI0v8DMhA",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeBootstrapScript = createThemeBootstrapScript();

  return (
    <html
      lang="ja"
      suppressHydrationWarning
      className={`${mainFont.variable} ${monoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <Script id="hmbt-theme-bootstrap" strategy="beforeInteractive">
          {themeBootstrapScript}
        </Script>
      </body>
    </html>
  );
}
