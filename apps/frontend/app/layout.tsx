import type { Metadata } from "next";
import {
  Inter,
  Space_Grotesk,
  Source_Serif_4,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const space = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
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
    <html lang="en">
      <body
        className={`${inter.variable} ${space.variable} ${serif.variable} ${mono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
