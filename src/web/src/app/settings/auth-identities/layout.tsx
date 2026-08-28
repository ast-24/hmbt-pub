import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "認証ID設定",
};

export default function SettingsAuthIdentitiesLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
