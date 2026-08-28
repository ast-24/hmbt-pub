import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログアウト",
};

export default function LogoutLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
