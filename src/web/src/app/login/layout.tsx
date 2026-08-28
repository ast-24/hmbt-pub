import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン",
};

export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
