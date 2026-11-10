"""One-shot adapter: convert downloaded kru2uni py2 source to Python 3 module."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "app" / "utils"
src = (ROOT / "_kru2uni_src.py").read_text(encoding="utf-8")
# Only strip py2 unicode prefixes (u'...' / u"..."), never the letter u inside a string.
src = re.sub(r"(?<=[\(\[=\s,])u(['\"])", r"\1", src)
src = src.replace("ur'", "r'").replace('ur"', 'r"')
src = re.sub(
    r"def getUnicode\(unk_txt\):.*?def kru2uni",
    '''def getUnicode(unk_txt):
    if isinstance(unk_txt, bytes):
        try:
            return unk_txt.decode("utf-8")
        except UnicodeDecodeError:
            return unk_txt.decode("latin-1")
    return str(unk_txt)


def kru2uni''',
    src,
    count=1,
    flags=re.S,
)
src = src.replace("return kru_text.encode('utf-8')", "return kru_text")
src = re.sub(r"\nif __name__ == '__main__':.*", "\n", src, flags=re.S)
body_start = src.find("k2u = [")
if body_start < 0:
    raise SystemExit("k2u not found")
header = '''"""KrutiDev → Unicode Devanagari (adapted from ltrc/kru2uni, GPL-3.0).

Original authors: Nehal J Wani, Raveesh Motlani
Language Technology Research Center, IIIT Hyderabad.
"""
from __future__ import annotations

import re

'''
out_path = ROOT / "krutidev_unicode.py"
out_path.write_text(header + src[body_start:], encoding="utf-8")
print("wrote", out_path)
