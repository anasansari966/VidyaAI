import Link from "next/link";
import { BOOK_DEMO_PATH } from "@/lib/brand";
import type { ReactNode } from "react";

type BookDemoLinkProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
};

export function BookDemoLink({ children, className = "", onClick }: BookDemoLinkProps) {
  return (
    <Link
      href={BOOK_DEMO_PATH}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
