import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "学校共通予定設定",
};

export default function SettingsCommonScheduleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
