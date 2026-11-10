import Image from "next/image";

type TextbookPagePreviewProps = {
  className?: string;
  caption?: string;
  showCaption?: boolean;
  priority?: boolean;
};

export function TextbookPagePreview({
  className = "",
  caption = "Textbook · Chapter 2 · Page 18",
  showCaption = true,
  priority = false,
}: TextbookPagePreviewProps) {
  return (
    <div className={className}>
      <div className="overflow-hidden rounded-lg bg-slate-100 p-2 shadow-inner sm:p-2.5">
        <div className="relative aspect-[10/13] w-full overflow-hidden rounded bg-white">
          <Image
            src="/marketing/textbook-page-science.svg"
            alt="Textbook page — Is Matter Around Us Pure?, Chapter 2"
            fill
            priority={priority}
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-contain object-top"
          />
        </div>
        {showCaption && (
          <p className="mt-1.5 text-[10px] text-slate-500 sm:text-[11px]">{caption}</p>
        )}
      </div>
    </div>
  );
}
