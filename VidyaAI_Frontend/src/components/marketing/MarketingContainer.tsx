import type { ReactNode } from "react";

export function MarketingContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`marketing-shell ${className}`}>{children}</div>;
}
