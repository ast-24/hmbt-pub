import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "個人時間割設定",
};

export default function SettingsPersonalTimetableLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
