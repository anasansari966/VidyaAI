import Link from "next/link";
import { LOGO_ASPECT_RATIO, LOGO_PATH, PRODUCT_NAME } from "@/lib/brand";

type BrandLogoProps = {
  href?: string | null;
  className?: string;
  height?: number;
  imagePosition?: "left" | "center";
  variant?: "default" | "nav";
};

export function BrandLogo({
  href = "/",
  className = "",
  height = 56,
  imagePosition = "left",
  variant = "default",
}: BrandLogoProps) {
  const width = Math.round(height * LOGO_ASPECT_RATIO);
  const positionClass = imagePosition === "center" ? "mx-auto" : "";
  const isNav = variant === "nav";

  const logo = (
    // Static public asset — direct URL so right-click "Open image in new tab" works.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_PATH}
      alt={PRODUCT_NAME}
      width={isNav ? undefined : width}
      height={isNav ? undefined : height}
      decoding="async"
      className={`brand-logo h-auto w-auto max-w-none shrink-0 object-contain object-left ${positionClass} ${
        isNav ? "brand-logo-nav" : ""
      } ${className}`}
      style={isNav ? undefined : { width, height }}
    />
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={`${PRODUCT_NAME} home`}
        title={PRODUCT_NAME}
        className="inline-flex shrink-0 outline-offset-4 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
      >
        {logo}
      </Link>
    );
  }

  return logo;
}
