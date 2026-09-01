import type { Metadata } from "next";
import { Karla, Playfair_Display_SC } from "next/font/google";
import "./globals.css";

const karla = Karla({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-karla",
  display: "swap",
});

const playfair = Playfair_Display_SC({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Table Booking",
  description: "Floor-plan-driven restaurant reservations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${karla.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
