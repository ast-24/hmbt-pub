import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ホーム",
};

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
