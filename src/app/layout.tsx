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
          <div className="nav-logo-plate">
            <img src="/ENOVA.avif" alt="Enova" className="nav-logo" width={375} height={205} />
          </div>
          <div className="nav-links">
            <NavLinks />
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
