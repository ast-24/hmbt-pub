import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "エラー",
};

export default function FatalErrorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
