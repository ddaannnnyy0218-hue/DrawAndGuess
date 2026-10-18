import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "画里有话 · Draw & Guess",
  description: "画得离谱，猜得默契。点链接，和朋友一起玩的多人绘画猜词游戏。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
