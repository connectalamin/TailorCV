import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body-family",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TailorCV — Resume Studio",
  description:
    "Upload a master resume, tailor it to each job, export PDF, track applications.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://api.fontshare.com/v2/css?f[]=general-sans@500,600,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${body.variable} ${mono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <Toaster
          theme="light"
          position="bottom-right"
          richColors
          closeButton
          duration={3200}
          visibleToasts={4}
          toastOptions={{
            className: "tailor-toast",
          }}
        />
      </body>
    </html>
  );
}
