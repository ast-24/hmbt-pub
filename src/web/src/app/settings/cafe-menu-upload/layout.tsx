import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "カフェメニュー画像アップロード設定",
};

export default function SettingsCafeMenuUploadLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
