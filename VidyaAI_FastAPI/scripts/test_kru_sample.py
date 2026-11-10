from pathlib import Path

from app.utils.indic_text_normalize import (
    content_looks_garbled_indic,
    deavanagari_ratio,
    normalize_extracted_text,
)

SAMPLE = r"""
dkO; [kaM
ân; fla/q efr lhi lekukA
Lokfr lkjnk dgfga lqtkukA
tks cj"kb cj ckfj fopk:A
gksafg dfor eqDrkefu pk:AA
& rqylhnkl
Reprint 2026-27


lu~ 1857 osQ ckxh lSfudksa dk dkSeh xhr
ge  gSa  blosQ  ekfyd  ¯gnqLrku  gekjk
ikd oru gS dkSe dk tUur ls Hkh I;kjk
;s  gS  gekjh  fefYd;r  ¯gnqLrku  gekjk
Reprint 2026-27


lwjnkl dk tUe lu~ 1478 esa ekuk tkrk gSA ,d ekU;rk
osQ vuqlkj mudk tUe eFkqjk osQ fudV jQudrk ;k
js.kqdk {ks=k esa gqvk tcfd nwljh ekU;rk osQ vuqlkj mudk
tUe&LFkku fnYyh osQ ikl lhgh ekuk tkrk gSAA egkizHkq
oYyHkkpk;Z osQ f'k"; lwjnkl v"VNki osQ dfo;ksa esa lokZfèkd
izfl¼ gSaA
Reprint 2026-27


Ñ".k us eFkqjk tkus osQ ckn
Lo;a u ykSVdj m¼o osQ tfj, xksfi;ksa osQ ikl lans'k Hkstk FkkA
"""

assert content_looks_garbled_indic(SAMPLE)
fixed = normalize_extracted_text(SAMPLE)
ratio = deavanagari_ratio(fixed)
Path("_kru_test.txt").write_text(
    f"ratio={ratio:.2f}\nreprint_left={'Reprint' in fixed}\n\n{fixed[:1500]}",
    encoding="utf-8",
)
assert ratio > 0.4, ratio
assert "सूरदास" in fixed or "सूर" in fixed
assert "हिंदुस्तान" in fixed or "हिन्दुस्तान" in fixed
assert "Reprint" not in fixed
print("ok", round(ratio, 2), "chars", len(fixed))
