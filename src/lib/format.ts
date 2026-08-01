export function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-MX").format(Math.round(n));
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPercent(n: number): string {
  return new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 }).format(n);
}
