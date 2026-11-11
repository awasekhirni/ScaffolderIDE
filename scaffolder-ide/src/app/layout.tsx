import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scaffolder IDE — Hexagonal Artefact Generator",
  description: "Multi-tab, Monaco-powered IDE for generating hexagonal artefacts across all platforms. Includes encoding tools, JSON/XML/SQL formatters, command palette, snippet library, multi-clipboard, diff view, markdown preview, and more.",
  keywords: ["Scaffolder IDE", "hexagonal architecture", "artefact generator", "code editor", "Monaco", "TypeScript", "Next.js"],
  authors: [{ name: "Scaffolder IDE" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Scaffolder IDE",
    description: "Multi-tab code editor for generating hexagonal artefacts on all platforms",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scaffolder IDE",
    description: "Multi-tab code editor for generating hexagonal artefacts on all platforms",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
