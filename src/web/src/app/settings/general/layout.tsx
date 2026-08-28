import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "詳細設定",
};

export default function SettingsGeneralLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
