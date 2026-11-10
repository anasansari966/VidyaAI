/** School-style Devanagari → Hinglish (Latin) for digital board text. */

const DEVANAGARI_RE = /[\u0900-\u097F]+/g;

const VOWELS: Record<string, string> = {
  अ: "a",
  आ: "aa",
  इ: "i",
  ई: "ee",
  उ: "u",
  ऊ: "oo",
  ऋ: "ri",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
  ऍ: "e",
  ऑ: "o",
};

const MATRAS: Record<string, string> = {
  "ा": "aa",
  "ि": "i",
  "ी": "ee",
  "ु": "u",
  "ू": "oo",
  "ृ": "ri",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
  "ॅ": "e",
  "ॉ": "o",
};

const CONSONANTS: Record<string, string> = {
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  ङ: "ng",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ञ: "ny",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  ण: "n",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "v",
  श: "sh",
  ष: "sh",
  स: "s",
  ह: "h",
};

const DIGRAPHS: Record<string, string> = {
  क्ष: "ksh",
  ज्ञ: "gy",
  त्र: "tr",
  श्र: "shr",
  क़: "q",
  ख़: "kh",
  ग़: "g",
  ज़: "z",
  फ़: "f",
  "ड़": "d",
  "ढ़": "dh",
};

const DIGITS: Record<string, string> = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

const VIRAMA = "्";
const ANUSVARA = "ं";
const CHANDRABINDU = "ँ";
const VISARGA = "ः";

function transliterateChunk(chunk: string): string {
  let out = "";
  let i = 0;
  while (i < chunk.length) {
    const ch = chunk[i];
    if (DIGITS[ch]) {
      out += DIGITS[ch];
      i += 1;
      continue;
    }
    if (VOWELS[ch]) {
      out += VOWELS[ch];
      i += 1;
      continue;
    }

    const digraph = chunk.slice(i, i + 2);
    if (DIGRAPHS[digraph]) {
      const base = DIGRAPHS[digraph];
      i += 2;
      if (chunk[i] === VIRAMA) {
        out += base;
        i += 1;
      } else if (MATRAS[chunk[i]]) {
        out += base + MATRAS[chunk[i]];
        i += 1;
      } else {
        out += base + "a";
      }
      continue;
    }

    if (CONSONANTS[ch]) {
      const base = CONSONANTS[ch];
      i += 1;
      if (chunk[i] === VIRAMA) {
        out += base;
        i += 1;
      } else if (MATRAS[chunk[i]]) {
        out += base + MATRAS[chunk[i]];
        i += 1;
      } else {
        out += base + "a";
      }
      continue;
    }

    if (MATRAS[ch]) {
      out += MATRAS[ch];
      i += 1;
      continue;
    }
    if (ch === ANUSVARA || ch === CHANDRABINDU) {
      out += "n";
      i += 1;
      continue;
    }
    if (ch === VISARGA) {
      out += "h";
      i += 1;
      continue;
    }
    if (ch === VIRAMA) {
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function containsDevanagari(text: string | null | undefined): boolean {
  return /[\u0900-\u097F]/.test(text || "");
}

export function containsArabicScript(text: string | null | undefined): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text || "");
}

/**
 * Display helper for notes/board: keep native scripts (Hindi/Sanskrit/Urdu)
 * and only apply Hinglish romanization when the text is meant to be Latin Hinglish.
 */
export function displayNotesText(text: string | null | undefined): string {
  const raw = (text || "").trim();
  if (!raw) return "";
  if (containsDevanagari(raw) || containsArabicScript(raw)) return raw;
  return toHinglish(raw);
}

/** Convert Devanagari runs to Hinglish roman letters for board display. */
export function toHinglish(text: string | null | undefined): string {
  const raw = (text || "").trim();
  if (!raw || !containsDevanagari(raw)) return raw;

  let result = raw.replace(DEVANAGARI_RE, (match) => transliterateChunk(match));
  result = result.replace(/\s+/g, " ").trim();
  result = result.replace(/aa+/g, "aa");
  result = result.replace(/\bpara\b/gi, "par");
  result = result.replace(/milate\b/gi, "milte");
  result = result.replace(/sabhee\b/gi, "sabhi");
  result = result.replace(/\bhamen\b/gi, "hamein");
  result = result.replace(/\bhamaen\b/gi, "hamein");
  return result;
}
