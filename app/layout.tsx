import type { Metadata, Viewport } from "next";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/noto-serif-sc";
import "@fontsource-variable/jetbrains-mono";
import "../tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "临武万和 · 订单管理",
  description: "万和热水器与喜乐乐取暖桌内部订单管理原型",
  applicationName: "临武万和订单管理",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f3ef",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
