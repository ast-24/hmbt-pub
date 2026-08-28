import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "初期設定",
};

export default function SetupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
