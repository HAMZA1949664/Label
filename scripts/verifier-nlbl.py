# -*- coding: utf-8 -*-
"""
Vérification croisée des fichiers .nlbl générés par le service Node.
Utilise pyzipper (implémentation Python indépendante de WinZip AES) pour :
 1. Déchiffrer et extraire les .nlbl générés (mot de passe fixe du format)
 2. Vérifier que le XML est bien formé (parseur XML strict)
 3. Vérifier que les 7 variables ont bien les valeurs injectées
 4. Vérifier l'intégrité du design : XML étiquette identique au template
    (hors <Name>), octet pour octet
 5. Vérifier la structure du lot .zip (N .nlbl + LISEZMOI.txt)

Exécution : python3 scripts/verifier-nlbl.py   (après bun run scripts/verifier-nlbl.ts)
"""
import sys
import xml.etree.ElementTree as ET

import pyzipper

MOT_DE_PASSE = b",^_A5Fus&!?j='Epiq*e"
LABEL = {
    "Modele": "SFAX MC",
    "Type": "Veste / Jacket",
    "OF": "078594",
    "CodeBarre": "3700791726390",
    "Couleur": "Noir",
    "Manche": "Manches courtes / Short sleeves",
    "Taille": "T3",
}

ok = 0
ko = 0


def check(nom, condition, detail=""):
    global ok, ko
    if condition:
        ok += 1
        print(f"  ✅ {nom}")
    else:
        ko += 1
        print(f"  ❌ {nom}{' — ' + detail if detail else ''}")


def extraire(chemin):
    with pyzipper.AESZipFile(chemin) as z:
        noms = z.namelist()
        contenu = {}
        for n in noms:
            contenu[n] = z.read(n, pwd=MOT_DE_PASSE)
        return noms, contenu


def vars_depuis_slnx(xml_bytes):
    """Extrait {nom variable: valeur StringValue} du .slnx (DefaultValue)."""
    racine = ET.fromstring(xml_bytes.decode("utf-8-sig"))
    resultats = {}
    for item in racine.iter("Item"):
        if item.get("Type") == "Variable":
            nom = item.findtext("Name")
            defaut = item.find("DefaultValue")
            if nom and defaut is not None:
                sv = defaut.find("StringValue")
                resultats[nom] = sv.text if sv is not None else ""
    return resultats


print("■ Fichier .nlbl simple (/tmp/test_etiquette.nlbl)")
noms, contenu = extraire("/tmp/test_etiquette.nlbl")
check("extraction AES réussie (2 entrées)", len(noms) == 2, str(noms))
check("entrées Formats/<nom> + <nom>.slnx", sorted(n.split("/")[-1].split(".")[0] for n in noms) == ["etiquettes_TEST", "etiquettes_TEST"])

entree_etiquette = next(n for n in noms if n.startswith("Formats/"))
entree_slnx = next(n for n in noms if n.endswith(".slnx"))

# 2. XML bien formé
try:
    ET.fromstring(contenu[entree_etiquette].decode("utf-8-sig"))
    check("XML étiquette bien formé", True)
except ET.ParseError as e:
    check("XML étiquette bien formé", False, str(e))
try:
    ET.fromstring(contenu[entree_slnx].decode("utf-8-sig"))
    check("XML solution bien formé", True)
except ET.ParseError as e:
    check("XML solution bien formé", False, str(e))

# 3. Variables injectées
valeurs = vars_depuis_slnx(contenu[entree_slnx])
for nom, attendu in LABEL.items():
    check(f"variable {nom} = {attendu!r}", valeurs.get(nom) == attendu, repr(valeurs.get(nom)))

# 4. Intégrité du design : XML étiquette == template (hors <Name>)
template = open("/home/z/my-project/src/lib/nlbl/templates/cLEMENT2_label.xml", "rb").read()
genere = contenu[entree_etiquette]
tmpl_txt = template.decode("utf-8-sig").replace("<Name>cLEMENT2</Name>", "<Name>X</Name>")
gen_txt = genere.decode("utf-8-sig").replace("<Name>etiquettes_TEST</Name>", "<Name>X</Name>")
check("XML étiquette identique au template (hors nom)", tmpl_txt == gen_txt)

# BOM UTF-8 conservé
check("BOM UTF-8 présent", genere.startswith(b"\xef\xbb\xbf"))

print("\n■ Fichier .nlbl simple avec nom différent (/tmp/test_simple.nlbl)")
noms2, _ = extraire("/tmp/test_simple.nlbl")
check("entrées renommées etiquettes_20250921_1107", sorted(n.split("/")[-1] for n in noms2) == ["etiquettes_20250921_1107", "etiquettes_20250921_1107.slnx"], str(noms2))

print("\n■ Lot .zip (/tmp/test_lot.zip)")
with pyzipper.AESZipFile("/tmp/test_lot.zip") as zlot:
    # le lot n'est PAS chiffré
    noms_lot = zlot.namelist()
    check("4 entrées (3 .nlbl + LISEZMOI.txt)", len(noms_lot) == 4, str(noms_lot))
    check("LISEZMOI.txt présent", any(n.endswith("LISEZMOI.txt") for n in noms_lot))
    nlbls = [n for n in noms_lot if n.endswith(".nlbl")]
    check("3 fichiers .nlbl", len(nlbls) == 3)
    # chaque .nlbl du lot est lui-même un .nlbl valide
    for n in nlbls:
        data = zlot.read(n)
        import io
        with pyzipper.AESZipFile(io.BytesIO(data)) as zint:
            noms_int = zint.namelist()
            entree_slnx_int = next(x for x in noms_int if x.endswith(".slnx"))
            vals = vars_depuis_slnx(zint.read(entree_slnx_int, pwd=MOT_DE_PASSE))
            check(f"{n.split('/')[-1]} : variable Modele = {vals.get('Modele', '?')!r}", "Modele" in vals)

print(f"\n════════ RÉSULTAT PYTHON : {ok} réussites, {ko} échecs ════════")
sys.exit(1 if ko else 0)
