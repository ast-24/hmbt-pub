import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Web表示設定",
};

export default function SettingsWebLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
