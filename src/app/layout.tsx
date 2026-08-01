import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reportes Kommo",
  description: "Panel de reportes de asesores y campañas sobre datos de Kommo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <nav className="nav">
          <Link href="/asesores">Asesores</Link>
          <Link href="/campanas">Campañas</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
