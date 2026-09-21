/**
 * Vérifications du générateur .nlbl — exécution : bun run scripts/verifier-nlbl.ts
 *
 * Couvre :
 * 1. Échappement XML (&, <, >, ", ')
 * 2. Validation des données (obligatoires, longueurs, EAN-13, caractères interdits)
 * 3. Génération .nlbl : injection des 7 variables dans le XML solution
 * 4. Intégrité du design : le XML étiquette (hors nom) reste identique au template
 * 5. Structure ZIP AES : entêtes conformes (méthode 99, champ AES 0x9901)
 * 6. Lot : .zip de N .nlbl + LISEZMOI
 * 7. Non-régression de l'export .TXT (format Clé=valeur CRLF de l'original)
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { xmlEscape, validerEtiquettes, validerImprimante, ean13Valide, MAX_ETIQUETTES } from "../src/lib/nlbl/validation";
import { construireNlbl, construireXmlsNlbl, genererPaquetNlbl, apercuNlbl, IMPRIMANTE_DEFAUT } from "../src/lib/nlbl/generator";
import { exportTxt, calculerEtiquette, couleurAffichee } from "../src/lib/label-data";
import { comparerTailles, trierTailles } from "../src/lib/tailles";
import { construireCsvColisage, extraireCodes, trierLignesColisage } from "../src/lib/colisage";
import { crc32 } from "../src/lib/nlbl/zip-aes";

let echecs = 0;
let reussites = 0;

function check(nom: string, condition: boolean, detail = "") {
  if (condition) {
    reussites++;
    console.log(`  ✅ ${nom}`);
  } else {
    echecs++;
    console.log(`  ❌ ${nom}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(titre: string) {
  console.log(`\n■ ${titre}`);
}

// ---------------------------------------------------------------------------
section("1. Échappement XML");
check(
  "caractères spéciaux échappés",
  xmlEscape(`A& B<C> D"E F'G`) === "A&amp; B&lt;C&gt; D&quot;E F&apos;G"
);
check("texte sans caractère spécial inchangé", xmlEscape("SFAX MC") === "SFAX MC");
check("accents conservés (UTF-8)", xmlEscape("Écru, Poudré") === "Écru, Poudré");

// ---------------------------------------------------------------------------
section("2. Validation des données");
const valide = {
  modele: "SFAX MC",
  type: "Veste / Jacket",
  of: "078594",
  codeBarre: "3700791726390",
  couleur: "Noir",
  manche: "Manches courtes / Short sleeves",
  taille: "T3",
};
const r1 = validerEtiquettes([valide]);
check("étiquette valide acceptée", r1.erreurs.length === 0 && r1.etiquettes.length === 1);

const r2 = validerEtiquettes([{ ...valide, of: "" }]);
check("OF vide rejeté", r2.erreurs.some((e) => e.champ === "of"));

const r3 = validerEtiquettes([{ ...valide, codeBarre: "3700791726391" }]);
check("clé EAN-13 invalide rejetée", r3.erreurs.some((e) => e.champ === "codeBarre"));
check("clé EAN-13 valide acceptée", ean13Valide("3700791726390"));
check("code non numérique rejeté", !ean13Valide("370079172639A"));

const r4 = validerEtiquettes([{ ...valide, modele: "X".repeat(41) }]);
check("longueur maximale (modèle > 40) rejetée", r4.erreurs.some((e) => e.champ === "modele"));

const r5 = validerEtiquettes([{ ...valide, couleur: "Peau\u0003de pêche" }]);
check("caractère de contrôle supprimé/validé", r5.etiquettes[0]?.couleur === "Peaude pêche");

const r6 = validerEtiquettes([valide, { ...valide, of: "" }]);
check("erreurs indexées par étiquette", r6.erreurs.every((e) => e.index === 1));

const trop = Array.from({ length: MAX_ETIQUETTES + 1 }, () => valide);
check(`lot de ${MAX_ETIQUETTES + 1} rejeté (max ${MAX_ETIQUETTES})`, validerEtiquettes(trop).erreurs.some((e) => e.champ === "lot"));
check(`lot de ${MAX_ETIQUETTES} accepté`, validerEtiquettes(trop.slice(0, MAX_ETIQUETTES)).erreurs.length === 0);

// ---------------------------------------------------------------------------
section("3. Génération .nlbl — injection des variables");
const buffer = construireNlbl(valide, "etiquettes_TEST");

// Lecture directe des entrées : le ZIP est chiffré (AES), on vérifie via Python
// pyzipper (implémentation indépendante) — voir vérification croisée ci-dessous.
writeFileSync("/tmp/test_etiquette.nlbl", buffer);
console.log(`  → fichier écrit : /tmp/test_etiquette.nlbl (${buffer.length} octets)`);

// Signature ZIP + entrée chiffrée
check("signature ZIP locale (PK\\x03\\x04)", buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])));
const bytes = buffer;
check("contient le nom d'entrée Formats/etiquettes_TEST", bytes.includes(Buffer.from("Formats/etiquettes_TEST")));

// Champ AES 0x9901 présent dans l'en-tête local
let champAesTrouve = false;
for (let i = 0; i < Math.min(200, buffer.length - 1); i++) {
  if (buffer[i] === 0x01 && buffer[i + 1] === 0x99) {
    champAesTrouve = true;
    break;
  }
}
check("champ supplémentaire AES 0x9901 présent", champAesTrouve);

// ---------------------------------------------------------------------------
section("4. Intégrité du design (XML étiquette inchangé)");
// On vérifie que le ZIP est extractible et que le XML étiquette est identique
// au template (hors <Name>). Cette partie est confiée à pyzipper (Python) et
// exécutée juste après par scripts/verifier-nlbl.py.

// ---------------------------------------------------------------------------
section("5. Lot de plusieurs étiquettes");
const lot = [
  valide,
  { ...valide, modele: "FIRENZE ML", couleur: "Blanc", taille: "T46", of: "078595", codeBarre: "3700791700130" },
  { ...valide, modele: "ADDICT MC", couleur: "Rouge", taille: "XS", of: "078596", codeBarre: "3700791700147" },
];
// Dates UTC explicites : 12:03 UTC = 14:03 à Paris (UTC+2 en septembre)
const paquet = genererPaquetNlbl(lot, new Date("2025-09-21T12:03:00Z"));
check("mode zip pour 3 étiquettes", paquet.mode === "zip");
check("nom horodaté AAAAMMJJ_HHmm (Europe/Paris)", paquet.filename === "etiquettes_20250921_1403.zip", paquet.filename);
writeFileSync("/tmp/test_lot.zip", paquet.data);
console.log(`  → fichier écrit : /tmp/test_lot.zip (${paquet.data.length} octets)`);

const paquet1 = genererPaquetNlbl([valide], new Date("2025-09-21T09:07:00Z"));
check("mode nlbl direct pour 1 étiquette", paquet1.mode === "nlbl" && paquet1.filename === "etiquettes_20250921_1107.nlbl", paquet1.filename);
writeFileSync("/tmp/test_simple.nlbl", paquet1.data);

// ---------------------------------------------------------------------------
section("6. Non-régression export .TXT (format original, taille FR + couleur EN/FR)");
const record: [string, string, string, string, string] = ["SFAX", "NOIR", "T3", "Courtes / Short", "3700791726390"];
const calc = calculerEtiquette({ record, of: "078594", typeValue: "Veste|Jacket", spe: false });
const txt = calc ? exportTxt(calc) : "";
const attendu = [
  "Modele=SFAX MC",
  "Type=Veste / Jacket",
  "OF=078594",
  "CodeBarre=3700791726390",
  // Couleur bilingue « EN / FR » (lisible sur l'étiquette)
  "Couleur=Black / Noir",
  "Manche=Manches courtes / Short sleeves",
  // Taille en français uniquement (plus de « T3-S3 »)
  "Taille=T3",
].join("\r\n");
check("contenu TXT conforme aux nouvelles règles d'affichage", txt === attendu, JSON.stringify(txt));

// Cas limites du format compact des tailles (affichage FR uniquement)
const t1 = calculerEtiquette({ record: ["X", "BLC", "46", "", "3700791700130"], of: "1", typeValue: "Toque|Chef hat", spe: false });
check("taille numérique → T46 (français seul)", t1?.taille === "T46", t1?.taille);
const t2 = calculerEtiquette({ record: ["X", "BLC", "3-4 A", "Longues / Long", "3700791700130"], of: "1", typeValue: "Veste|Jacket", spe: false });
check("tranche d'âge → T3-4A (français seul)", t2?.taille === "T3-4A", t2?.taille);
const t3 = calculerEtiquette({ record: ["X", "BLC", "TU", "", "3700791700130"], of: "1", typeValue: "Tablier|Apron", spe: false });
check("taille unique → TU (français seul)", t3?.taille === "TU", t3?.taille);

// Couleur bilingue « EN / FR » avec repli lisibilité (français seul si trop long)
const c1 = calculerEtiquette({ record: ["X", "BLC", "T3", "", "3700791700130"], of: "1", typeValue: "Veste|Jacket", spe: false });
check("couleur lisible → bilingue (White / Blanc)", c1?.couleur === "White / Blanc", c1?.couleur);
const c2 = calculerEtiquette({ record: ["X", "PO", "T3", "", "3700791700130"], of: "1", typeValue: "Veste|Jacket", spe: false });
check("couleur limite 20 caractères incluse (Powder Pink / Poudré)", c2?.couleur === "Powder Pink / Poudré", c2?.couleur);
const c3 = calculerEtiquette({ record: ["X", "SOUR", "T3", "", "3700791700130"], of: "1", typeValue: "Veste|Jacket", spe: false });
check("couleur trop longue → français seul (Gris souris)", c3?.couleur === "Gris souris", c3?.couleur);
const c4 = calculerEtiquette({ record: ["X", "FUSH", "T3", "", "3700791700130"], of: "1", typeValue: "Veste|Jacket", spe: false });
check("couleur identique EN/FR → un seul libellé (Fuchsia)", c4?.couleur === "Fuchsia", c4?.couleur);
check(
  "LIMITE_COULEUR_BILINGUE = 20 (inclus : Navy / Marine, Steel Grey / Acier, Opera / Opéra ; repli : Peau de pêche)",
  couleurAffichee("MARI") === "Navy / Marine" &&
    couleurAffichee("ACIE") === "Steel Grey / Acier" &&
    couleurAffichee("OPER") === "Opera / Opéra" &&
    couleurAffichee("PDP2") === "Peau de pêche" // « Peach / Peau de pêche » = 22 > 20 → repli FR
);

// Mode SPE : code-barres 99 + 10 chiffres + clé
const t4 = calculerEtiquette({ record: ["SFAX", "NOIR", "T3", "Courtes / Short", "0000000000000"], of: "078594", typeValue: "Veste|Jacket", spe: true });
check("mode SPE : code-barres 99xxxxxxxxxxX", /^99\d{10}\d$/.test(t4?.codeBarre ?? ""), t4?.codeBarre);
check("mode SPE : clé EAN-13 valide", t4 ? ean13Valide(t4.codeBarre) : false);
check("mode SPE : suffixe modèle « SPE »", t4?.modele === "SFAX MC SPE", t4?.modele);

// ---------------------------------------------------------------------------
section("7. CRC32 (contrôle croisé avec valeur connue)");
check("CRC32 de « 123456789 » = 0xCBF43926", crc32(Buffer.from("123456789")) === 0xcbf43926);

// ---------------------------------------------------------------------------
section("8. Imprimante cible injectée (préférences utilisateur)");
const templateFormat = readFileSync(
  join(process.cwd(), "src", "lib", "nlbl", "templates", "cLEMENT2_label.xml"),
  "utf-8"
);

// 8a. Sans préférence : imprimante du template conservée
const { format: formatSansPrefs } = construireXmlsNlbl(valide, "etiquettes_TEST");
check(
  `sans préférence : ${IMPRIMANTE_DEFAUT} conservé`,
  formatSansPrefs.includes(`<Name>${IMPRIMANTE_DEFAUT}</Name>`)
);

// 8b. Avec préférence : Name, DriverName et DevModeBuffer remplacés
const IMPRIMANTE_TEST = "ZDesigner ZD621-203dpi ZPL";
const { format: formatPrefs } = construireXmlsNlbl(valide, "etiquettes_TEST", {
  imprimante: IMPRIMANTE_TEST,
});
const blocImprimantePrefs = /<Printer Type="Printer">[\s\S]*?<\/Printer>/.exec(formatPrefs)?.[0] ?? "";
const blocImprimanteOrigine = /<Printer Type="Printer">[\s\S]*?<\/Printer>/.exec(templateFormat)?.[0] ?? "";
check("bloc <Printer> trouvé dans le XML généré", blocImprimantePrefs.length > 0);
check("<Name> remplacé", blocImprimantePrefs.includes(`<Name>${IMPRIMANTE_TEST}</Name>`));
check("<DriverName> remplacé", blocImprimantePrefs.includes(`<DriverName>${IMPRIMANTE_TEST}</DriverName>`));

const b64Prefs = /<DevModeBuffer>([^<]*)<\/DevModeBuffer>/.exec(blocImprimantePrefs)?.[1] ?? "";
const b64Origine = /<DevModeBuffer>([^<]*)<\/DevModeBuffer>/.exec(blocImprimanteOrigine)?.[1] ?? "";
const devmodePrefs = Buffer.from(b64Prefs, "base64");
const devmodeOrigine = Buffer.from(b64Origine, "base64");
check(
  "DevModeBuffer : dmDeviceName UTF-16LE complet (WCHAR[32], jusqu'à 32 caractères)",
  devmodePrefs.includes(Buffer.from(IMPRIMANTE_TEST, "utf16le"))
);
check(
  "DevModeBuffer : nom ANSI des données driver remplacé (tronqué à 16 caractères)",
  devmodePrefs.includes(Buffer.from(IMPRIMANTE_TEST.slice(0, 16), "latin1"))
);
check(
  "DevModeBuffer : ancien nom totalement absent (UTF-16LE et ANSI)",
  !devmodePrefs.includes(Buffer.from(IMPRIMANTE_DEFAUT, "utf16le")) &&
    !devmodePrefs.includes(Buffer.from(IMPRIMANTE_DEFAUT, "latin1"))
);
check(
  "DevModeBuffer : longueur d'octets identique (structure DEVMODEW intacte)",
  devmodePrefs.length === devmodeOrigine.length
);
check(
  "DevModeBuffer : chaîne base64 de même longueur (aucun décalage XML)",
  b64Prefs.length === b64Origine.length
);

// 8c. Échappement XML du nom d'imprimante + troncature du dmDeviceName
const { format: formatEchappe } = construireXmlsNlbl(valide, "etiquettes_TEST", {
  imprimante: `A&B<C>"'D`,
});
check(
  "nom d'imprimante échappé XML (& < > \" ')",
  formatEchappe.includes("<Name>A&amp;B&lt;C&gt;&quot;&apos;D</Name>")
);

// 8d. Le design reste identique : seuls Name/DriverName/DevModeBuffer diffèrent
const sansBlocImprimante = (xml: string) =>
  xml.replace(/<Printer Type="Printer">[\s\S]*?<\/Printer>/, "<Printer/>");
check(
  "design intact : XML étiquette identique hors bloc imprimante (nom interne inclus)",
  sansBlocImprimante(formatPrefs) === sansBlocImprimante(formatSansPrefs)
);
check(
  "design intact : polices ZEBRA 0 préservées",
  (formatPrefs.match(/FaceName>ZEBRA 0</g) ?? []).length ===
    (templateFormat.match(/FaceName>ZEBRA 0</g) ?? []).length
);

// 8e. Validation du nom d'imprimante
check("imprimante non fournie → pas de modification", Object.keys(validerImprimante(undefined)).length === 0);
check("imprimante vide → pas de modification", Object.keys(validerImprimante("   ")).length === 0);
check("imprimante trop longue rejetée", validerImprimante("X".repeat(65)).erreur !== undefined);
check(
  "imprimante nettoyée (contrôles supprimés, espaces tronqués)",
  validerImprimante("  ZDesigner\tGK420d ")?.nom === "ZDesigner GK420d"
);
check("imprimante non-chaîne rejetée", validerImprimante(42).erreur !== undefined);

// 8f. Aperçu structuré (API /api/nlbl/preview)
const apercu = apercuNlbl(valide, "etiquettes_TEST", { imprimante: IMPRIMANTE_TEST });
check("aperçu : 7 variables dans l'ordre du template", apercu.variables.length === 7);
check("aperçu : valeurs exactes", apercu.variables.every((v) => {
  const champ = { Modele: valide.modele, Type: valide.type, OF: valide.of, CodeBarre: valide.codeBarre, Couleur: valide.couleur, Manche: valide.manche, Taille: valide.taille }[v.nom as keyof typeof valide];
  return champ === v.valeur;
}));
check("aperçu : imprimante reflétée", apercu.imprimante === IMPRIMANTE_TEST);
check("aperçu : 2 entrées ZIP", apercu.entrees.length === 2);
check("aperçu : taille cohérente (ZIP AES réel)", apercu.tailleOctets > 2000);
check("aperçu : XML solution contient les valeurs injectées", apercu.xmlSolution.includes(`<UserValue>${xmlEscape(valide.modele)}</UserValue>`));

// 8g. Lot avec imprimante : option propagée à chaque .nlbl du .zip
const paquetImprimante = genererPaquetNlbl(
  [valide, { ...valide, modele: "FIRENZE ML", of: "078595", codeBarre: "3700791700130" }],
  new Date("2025-09-21T12:03:00Z"),
  { imprimante: IMPRIMANTE_TEST }
);
check("lot avec préférence : mode zip", paquetImprimante.mode === "zip");
writeFileSync("/tmp/test_lot_imprimante.zip", paquetImprimante.data);
console.log(`  → fichier écrit : /tmp/test_lot_imprimante.zip (${paquetImprimante.data.length} octets, imprimante ${IMPRIMANTE_TEST})`);

// ---------------------------------------------------------------------------
section("9. Quantités de copies (lot .zip + LISEZMOI)");

// 9a. Sans quantités : 1 copie par fichier
const paquetDefaut = genererPaquetNlbl(lot, new Date("2025-09-21T12:03:00Z"));
check(
  "sans quantités : copiesTotales = nombre de fichiers",
  paquetDefaut.copiesTotales === 3 && paquetDefaut.labelCount === 3
);

// 9b. Avec quantités : somme des copies, nombre de fichiers inchangé
const paquetQuant = genererPaquetNlbl(lot, new Date("2025-09-21T12:03:00Z"), {
  quantites: [5, 3, 1],
});
check("copiesTotales = somme des quantités (5+3+1 = 9)", paquetQuant.copiesTotales === 9);
check("labelCount inchangé (3 fichiers distincts)", paquetQuant.labelCount === 3);
writeFileSync("/tmp/test_quantites.zip", paquetQuant.data);
console.log(`  → fichier écrit : /tmp/test_quantites.zip (${paquetQuant.data.length} octets, quantités 5/3/1)`);

// 9c. Quantités invalides → normalisées à 1 (garde-fou serveur)
const paquetQuantInvalides = genererPaquetNlbl(lot, new Date("2025-09-21T12:03:00Z"), {
  quantites: [0, 150, -2],
});
check(
  "quantités invalides (0, 150, -2) normalisées à 1",
  paquetQuantInvalides.copiesTotales === 3
);

// 9d. Fichier unique avec quantité : copiesTotales reflète la quantité
const monoQuant = genererPaquetNlbl([valide], new Date("2025-09-21T09:07:00Z"), {
  quantites: [7],
});
check(
  "fichier unique : quantité 7 acceptée (mode nlbl)",
  monoQuant.mode === "nlbl" && monoQuant.copiesTotales === 7
);

// 9e. Quantités désalignées → ignorées (défaut 1)
const paquetDesaligne = genererPaquetNlbl(lot, new Date("2025-09-21T12:03:00Z"), {
  quantites: [2, 2],
});
check(
  "quantités désalignées ignorées (défaut 1 partout)",
  paquetDesaligne.copiesTotales === 3
);

// ---------------------------------------------------------------------------
section("10. Tri logique des tailles (du plus petit au plus grand)");
check(
  "grille littérale : XS < S < M < L < XL < XXL < 3XL < 4XL",
  JSON.stringify(
    trierTailles(["XL", "S", "4XL", "XS", "XXL", "M", "3XL", "L", "S"])
  ) === JSON.stringify(["XS", "S", "S", "M", "L", "XL", "XXL", "3XL", "4XL"]),
  JSON.stringify(trierTailles(["XL", "S", "4XL", "XS", "XXL", "M", "3XL", "L", "S"]))
);
check(
  "grille numérique : 36 < 38 < 40 < 42 < 44 < 46 < 48 < 50",
  JSON.stringify(trierTailles(["48", "36", "44", "38", "50", "40", "46", "42"])) ===
    JSON.stringify(["36", "38", "40", "42", "44", "46", "48", "50"])
);
check(
  "préfixées T : T0 < T1 < T8 < T34 < T46 < T64",
  JSON.stringify(trierTailles(["T46", "T8", "T34", "T0", "T64", "T1"])) ===
    JSON.stringify(["T0", "T1", "T8", "T34", "T46", "T64"])
);
check(
  "taille unique et bébé d'abord, âge ensuite",
  JSON.stringify(trierTailles(["10-12", "TU", "3-4 A", "BEBE", "U"])) ===
    JSON.stringify(["TU", "U", "BEBE", "3-4 A", "10-12"]),
  JSON.stringify(trierTailles(["10-12", "TU", "3-4 A", "BEBE", "U"]))
);
check(
  "spéciales en fin : 4XL < SPE- < SPE+",
  comparerTailles("SPE-", "SPE+") < 0 && comparerTailles("4XL", "SPE-") < 0
);
check("tri non destructif (copie)", (() => {
  const source = ["M", "XS"];
  trierTailles(source);
  return JSON.stringify(source) === JSON.stringify(["M", "XS"]);
})());

// ---------------------------------------------------------------------------
section("11. Colisage — extraction, regroupement, export");
check(
  "extraction : une ligne = un code",
  JSON.stringify(extraireCodes("3700791700130\n3700791700147")) ===
    JSON.stringify(["3700791700130", "3700791700147"])
);
check(
  "extraction : export multi-colonnes et séparateurs tolérés",
  JSON.stringify(extraireCodes("ref;3700791700130;S\n3700791700147\tok")) ===
    JSON.stringify(["3700791700130", "3700791700147"])
);
check("extraction : nombre à 14 chiffres ignoré (pas de faux positif)", extraireCodes("12345678901234").length === 0);
check("extraction : doublons conservés (une pièce de plus)", extraireCodes("3700791700130\n3700791700130").length === 2);

const lignesColisage = trierLignesColisage([
  { of: "078910", modele: "FIRENZE ML", couleur: "Blanc", couleurCode: "BLC", taille: "M", manche: "Manches longues", quantite: 48 },
  { of: "", modele: "ADDICT MC", couleur: "Noir", couleurCode: "NOIR", taille: "S", manche: "Manches courtes", quantite: 12 },
  { of: "078910", modele: "FIRENZE ML", couleur: "Blanc", couleurCode: "BLC", taille: "S", manche: "Manches longues", quantite: 25 },
  { of: "078594", modele: "SFAX ML SPE", couleur: "Noir", couleurCode: "NE", taille: "T46", manche: "Manches longues", quantite: 7 },
  { of: "078910", modele: "FIRENZE ML", couleur: "Noir", couleurCode: "NOIR", taille: "M", manche: "Manches longues", quantite: 35 },
]);
check(
  "regroupement trié : OF croissant → modèle → couleur → taille",
  JSON.stringify(lignesColisage.map((l) => `${l.of}|${l.modele}|${l.couleur}|${l.taille}`)) ===
    JSON.stringify([
      "078594|SFAX ML SPE|Noir|T46",
      "078910|FIRENZE ML|Blanc|S",
      "078910|FIRENZE ML|Blanc|M",
      "078910|FIRENZE ML|Noir|M",
      "|ADDICT MC|Noir|S",
    ]),
  JSON.stringify(lignesColisage.map((l) => `${l.of}|${l.modele}|${l.couleur}|${l.taille}`))
);
const csv = construireCsvColisage(lignesColisage);
check("CSV : en-têtes + BOM UTF-8", csv.startsWith("\uFEFFOF;Modele;Couleur;Taille;Quantite;Manche\r\n"));
check("CSV : OF vide → tiret", csv.includes("\r\n-;ADDICT MC;Noir;S;12;"));
check("CSV : échappement des valeurs avec séparateur", construireCsvColisage([
  { of: "", modele: "A;B", couleur: "C", couleurCode: "C", taille: "M", manche: "", quantite: 1 },
]).includes('"A;B"'));

// ---------------------------------------------------------------------------
console.log(`\n════════ RÉSULTAT : ${reussites} réussites, ${echecs} échecs ════════`);
process.exit(echecs > 0 ? 1 : 0);
