import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AiClip",
  description: "Bilingual UI restoration workspace powered by manifests.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
