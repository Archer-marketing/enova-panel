"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/asesores", label: "Asesores" },
  { href: "/campanas", label: "Campañas" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : undefined}>
          {link.label}
        </Link>
      ))}
    </>
  );
}
