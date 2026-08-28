import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "プロフィール設定",
};

export default function SettingsProfileLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
