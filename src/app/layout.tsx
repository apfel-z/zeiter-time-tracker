import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZEIT // Niklas Fritsch",
  description: "Minimalistisches Time-Tracking System nach Dieter Rams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="font-sans bg-[#F4F1EA] text-[#191918] min-h-screen selection:bg-[#E04F26] selection:text-white">
        {children}
      </body>
    </html>
  );
}
