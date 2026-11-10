from pathlib import Path

from app.utils.krutidev_unicode import kru2uni


def fix(s: str) -> str:
    s = s.replace("osQ", "ds").replace("OsQ", "ds")
    return kru2uni(s)


samples = [
    "¯gnqLrku gekjk",
    "lu~ 1857 osQ ckxh lSfudksa dk dkSeh xhr",
    "ge  gSa  blosQ  ekfyd  ¯gnqLrku  gekjk",
    "m¼o",
    'Ñ".k',
    "lwjnkl dk tUe lu~ 1478 esa ekuk tkrk gSA",
]

lines: list[str] = []
for s in samples:
    lines.append(s)
    lines.append("  raw: " + kru2uni(s))
    lines.append("  fix: " + fix(s))
    lines.append("")

Path("_kru_test.txt").write_text("\n".join(lines), encoding="utf-8")
print("done")
