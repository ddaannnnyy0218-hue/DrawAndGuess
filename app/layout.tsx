import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "画里有话 · Draw & Guess",
  description: "段位对战、假答案和好友画猜。用创意画笔，画出下一段位。",
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
