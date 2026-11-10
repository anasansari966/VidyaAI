/** Open-source photos from Unsplash (https://unsplash.com/license) */
function hd(photoId: string, width = 2400, height?: number) {
  const h = height ? `&h=${height}` : "";
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}${h}&q=90`;
}

export const marketingImages = {
  hero: {
    src: hd("photo-1522202176988-66273c2fd55f", 1920, 2400),
    alt: "Students collaborating on a learning project",
  },
  heroAccent: {
    src: hd("photo-1503676260728-1c00da094a0b", 1200, 1200),
    alt: "Student studying with books and laptop",
  },
  library: {
    src: hd("photo-1523240795612-9a054b0db644", 1920, 1280),
    alt: "Students studying with textbooks",
  },
  classroom: {
    src: hd("photo-1498243691581-b145c3f54a5a", 1600, 2000),
    alt: "Student learning on laptop in classroom",
  },
  study: {
    src: hd("photo-1427504494785-3a9ca7044f45", 1920, 1280),
    alt: "Students in a modern classroom",
  },
  cta: {
    src: hd("photo-1588072432836-e10032774350", 1920, 1280),
    alt: "Students learning together",
  },
  focus: {
    /* https://unsplash.com/photos/1c00da094a0b — student studying with books */
    src: hd("photo-1503676260728-1c00da094a0b", 1800, 2400),
    alt: "Focused student studying with books and notes",
  },
  technology: {
    /* https://unsplash.com/photos/HKnvq4krutI — laptop learning in classroom */
    src: hd("photo-1772971919691-598c37fe4b81", 2400, 1600),
    alt: "Student using a laptop for digital learning in class",
  },
} as const;
