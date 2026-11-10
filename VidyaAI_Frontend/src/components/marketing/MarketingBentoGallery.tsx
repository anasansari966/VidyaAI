import { marketingImages } from "@/lib/marketingImages";
import { MarketingImage } from "./MarketingImage";
import { Reveal } from "./Reveal";
import { MarketingContainer } from "./MarketingContainer";

const tiles = [
  {
    key: "library",
    image: marketingImages.library,
    label: "Curriculum library",
    span: "hero-bento-tile-wide",
  },
  {
    key: "focus",
    image: marketingImages.focus,
    label: "Deep focus study",
    span: "hero-bento-tile-tall",
  },
  {
    key: "technology",
    image: marketingImages.technology,
    label: "Digital-first learning",
    span: "hero-bento-tile-square",
  },
  {
    key: "study",
    image: marketingImages.study,
    label: "Collaborative classrooms",
    span: "hero-bento-tile-square",
  },
  {
    key: "classroom",
    image: marketingImages.classroom,
    label: "Everyday learning",
    span: "hero-bento-tile-full",
  },
] as const;

export function MarketingBentoGallery() {
  return (
    <section className="w-full py-16 md:py-20">
      <MarketingContainer>
        <Reveal instant>
          <p className="section-label mb-3 text-center">Learning in action</p>
          <h2 className="mx-auto max-w-3xl text-center text-3xl font-bold tracking-tight md:text-4xl">
            Real classrooms.{" "}
            <span className="marketing-gradient-text">Real outcomes.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
            High-definition imagery that reflects how schools and coaching centers actually teach, practice, and grow.
          </p>
        </Reveal>

        <div className="marketing-bento-gallery mt-10 md:mt-14">
          {tiles.map((tile) => (
            <div key={tile.key} className={`${tile.span} min-w-0`}>
              <div className="group relative h-full min-h-[180px] overflow-hidden rounded-2xl border border-white/10 bg-[#0a0e16] shadow-xl shadow-black/20 md:min-h-[220px]">
                <MarketingImage
                  src={tile.image.src}
                  alt={tile.image.alt}
                  fill
                  eager
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#06080f]/95 via-[#06080f]/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
                  <p className="text-sm font-semibold text-white md:text-base">{tile.label}</p>
                </div>
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10 transition group-hover:ring-teal-400/30" />
              </div>
            </div>
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}
