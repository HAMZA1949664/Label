#!/usr/bin/env python3
"""Génère les icônes PWA (192, 512, maskable 512, apple-touch 180)
— carré ambre arrondi + étiquette blanche stylisée (barcode + OF)."""

from PIL import Image, ImageDraw

AMBER_HAUT = (245, 158, 11)    # amber-500
AMBER_BAS = (180, 83, 9)       # amber-700
NOIR = (24, 24, 27)            # zinc-900
BLANC = (255, 255, 255)


def fond_ambre(taille: int) -> Image.Image:
    """Carré plein (fond maskable) avec dégradé vertical ambre."""
    img = Image.new("RGB", (taille, taille), AMBER_HAUT)
    d = ImageDraw.Draw(img)
    for y in range(taille):
        t = y / (taille - 1)
        c = tuple(int(AMBER_HAUT[i] + (AMBER_BAS[i] - AMBER_HAUT[i]) * t) for i in range(3))
        d.line([(0, y), (taille, y)], fill=c)
    return img


def dessiner_etiquette(img: Image.Image, marge: float = 0.19) -> None:
    """Étiquette blanche centrée : titre, lignes, code-barres, pied OF."""
    t = img.size[0]
    d = ImageDraw.Draw(img)
    # Carte blanche arrondie
    x0 = y0 = int(t * marge)
    x1 = y1 = int(t * (1 - marge))
    rayon = int(t * 0.06)
    d.rounded_rectangle([x0, y0, x1, y1], radius=rayon, fill=BLANC)
    # Marge interne
    mx = int(t * (marge + 0.07))
    my = int(t * (marge + 0.09))
    ix1 = int(t * (1 - marge - 0.07))
    iy1 = int(t * (1 - marge - 0.09))
    # Titre « modèle » (barre noire épaisse)
    haut_titre = int(t * 0.055)
    d.rounded_rectangle([mx, my, mx + int((ix1 - mx) * 0.62), my + haut_titre],
                        radius=haut_titre // 3, fill=NOIR)
    # Sous-titre (barre grise plus courte)
    sous = int(t * 0.028)
    d.rounded_rectangle([mx, my + haut_titre + int(t * 0.03), mx + int((ix1 - mx) * 0.4),
                         my + haut_titre + int(t * 0.03) + sous],
                        radius=max(sous // 3, 1), fill=(161, 161, 170))
    # Séparateur
    y_sep = int(t * 0.47)
    d.rectangle([mx, y_sep, ix1, y_sep + max(int(t * 0.008), 1)], fill=NOIR)
    # Code-barres : barres verticales irrégulières (rappel EAN-13)
    y_bc0 = y_sep + int(t * 0.05)
    y_bc1 = y_bc0 + int(t * 0.16)
    x = mx
    largeur = ix1 - mx
    i = 0
    motif = [3, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 3, 1, 2, 2, 1, 3, 1]
    total = sum(motif)
    for m in motif:
        l = max(int(largeur * m / total), 1)
        if i % 2 == 0:
            d.rectangle([x, y_bc0, min(x + l, ix1), y_bc1], fill=NOIR)
        x += l
        i += 1
    # Pied « OF » (barre ambre foncé)
    y_of0 = y_bc1 + int(t * 0.05)
    d.rounded_rectangle([mx + int(largeur * 0.18), y_of0, ix1 - int(largeur * 0.18),
                         y_of0 + int(t * 0.05)], radius=int(t * 0.02), fill=AMBER_BAS)


def icone_arrondie(base: Image.Image, taille: int) -> Image.Image:
    """Fond arrondi (coins transparents) — icône « any »."""
    img = base.resize((taille, taille), Image.LANCZOS).convert("RGBA")
    masque = Image.new("L", (taille, taille), 0)
    d = ImageDraw.Draw(masque)
    d.rounded_rectangle([0, 0, taille - 1, taille - 1], radius=int(taille * 0.22), fill=255)
    img.putalpha(masque)
    return img


base = fond_ambre(1024)
dessiner_etiquette(base)

sortie = "/home/z/my-project/public"
icone_arrondie(base, 192).save(f"{sortie}/icon-192.png", optimize=True)
icone_arrondie(base, 512).save(f"{sortie}/icon-512.png", optimize=True)
# Maskable : fond plein débordant (sans coins transparents)
base.resize((512, 512), Image.LANCZOS).save(f"{sortie}/icon-maskable-512.png", optimize=True)
# Apple touch icon (180, fond plein opaque)
base.resize((180, 180), Image.LANCZOS).convert("RGB").save(
    f"{sortie}/apple-touch-icon.png", optimize=True)

print("Icônes générées : icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png")
