import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "クラス時間割設定",
};

export default function SettingsClassTimetableLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
