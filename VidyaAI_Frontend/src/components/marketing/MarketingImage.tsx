import Image from "next/image";

type MarketingImageProps = {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  eager?: boolean;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
};

export function MarketingImage({
  src,
  alt,
  className = "",
  priority = false,
  eager = false,
  fill = false,
  width,
  height,
  sizes = "(max-width: 768px) 100vw, 50vw",
}: MarketingImageProps) {
  const loading = priority || eager ? "eager" : "lazy";

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        loading={loading}
        quality={90}
        sizes={sizes}
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width ?? 1200}
      height={height ?? 800}
      priority={priority}
      loading={loading}
      quality={90}
      sizes={sizes}
      className={`h-auto w-full object-cover ${className}`}
    />
  );
}
