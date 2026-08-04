import type { Metadata } from "next";
import { NavLinks } from "@/components/NavLinks";
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
          <NavLinks />
        </nav>
        {children}
      </body>
    </html>
  );
}
