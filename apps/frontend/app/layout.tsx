import type { Metadata } from "next";
import { JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

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
      <body className={`${serif.variable} ${mono.variable} antialiased`}>
        {children}
        <Toaster
          theme="dark"
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
