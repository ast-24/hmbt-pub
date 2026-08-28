import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "LINEボット",
};

export default function LineBotLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
