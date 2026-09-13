import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVO COMEPLAYERS Operasional & Keuangan",
  description: "Sistem kendali operasional dan keuangan internal CP-OFS",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
