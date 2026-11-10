import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LOGO_ICON_PATH, LOGO_PATH, PRODUCT_NAME, SITE_URL } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${PRODUCT_NAME} — AI Learning Platform for Schools & Exam Prep`,
  description:
    "Upload curriculum books, generate AI lectures, run synced live classes, and give students tutor-style learning across School, JEE, NEET, and Govt tracks.",
  openGraph: {
    title: `${PRODUCT_NAME} — AI Learning Platform`,
    description: "Live classes synced to textbooks. Admin console, student hub, and AI tutor in one platform.",
    images: [{ url: LOGO_PATH, alt: PRODUCT_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME} — AI Learning Platform`,
    images: [LOGO_PATH],
  },
  icons: {
    icon: [{ url: LOGO_ICON_PATH, type: "image/png" }],
    apple: [{ url: LOGO_ICON_PATH, type: "image/png" }],
    shortcut: LOGO_ICON_PATH,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
      </head>
      <body className="flex min-h-full w-full flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
