import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "iCal設定",
};

export default function SettingsIcalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
