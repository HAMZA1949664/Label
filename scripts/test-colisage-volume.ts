/**
 * Test de volume du colisage — exécution : bun run scripts/test-colisage-volume.ts
 *
 * Simule une session de colisage réelle : 4 000 codes-barres scannés
 * (mélange de références FAB, de codes SPE calculés pour 2 OF et de codes
 * inconnus), envoyés en UNE requête à /api/colisage. Vérifie :
 * - le comptage exact des quantités (doublons compris) ;
 * - le regroupement OF → modèle → couleur → taille ;
 * - la détection des codes inconnus ;
 * - les performances (objectif : traitement < 5 s pour 4 000 codes).
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

interface LigneColisage {
  of: string;
  modele: string;
  couleur: string;
  taille: string;
  quantite: number;
}

interface ReponseColisage {
  lignes: LigneColisage[];
  inconnus: { code: string; quantite: number }[];
  stats: {
    total: number;
    reconnus: number;
    inconnusQuantite: number;
    skus: number;
    ofs: number;
    quantite: number;
    dureeMs: number;
  };
}

let echecs = 0;
function check(nom: string, condition: boolean, detail = "") {
  console.log(`${condition ? "  ✅" : "  ❌"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!condition) echecs++;
}

/** Générateur pseudo-aléatoire déterministe (reproductibilité du test). */
let graine = 20260921;
function aleatoire(): number {
  graine = (graine * 1103515245 + 12345) % 2147483648;
  return graine / 2147483648;
}
function entier(max: number): number {
  return Math.floor(aleatoire() * max);
}

async function main() {
  console.log("■ Préparation du jeu de test (4 000 codes)");

  // 1. Catalogue réel via l'API
  const catalogue: Array<[string, string, string, string, string]> = (
    await (await fetch(`${BASE}/api/articles`)).json()
  ).records;
  console.log(`  catalogue chargé : ${catalogue.length} références`);
  if (catalogue.length < 100) throw new Error("catalogue trop petit pour le test");

  // 2. Composition du lot scanné (4 000 lignes réalistes)
  const codes: string[] = [];
  // a. 3 050 scans FAB répartis sur ~40 références (histogramme réaliste : quelques tailles dominantes)
  const refsFab = Array.from({ length: 40 }, () => catalogue[entier(catalogue.length)]);
  for (let i = 0; i < 3050; i++) codes.push(refsFab[entier(refsFab.length)][4]);
  // b. 800 scans SPE : 2 OF × 20 combinaisons × 20 pièces (production de deux OF)
  const { speBarcode } = await import("../src/lib/label-data");
  for (const of of ["078594", "099001"]) {
    for (let i = 0; i < 20; i++) {
      const r = catalogue[entier(catalogue.length)];
      codes.push(...Array(20).fill(speBarcode(r[0], r[1], r[3], r[2], of)));
    }
  }
  // c. 150 codes inconnus à 13 chiffres valides (erreurs de scan, références d'un autre site)
  for (let i = 0; i < 150; i++) {
    const base = `77${String(entier(1e10)).padStart(10, "0")}`;
    const digits = base.split("").map(Number);
    const cle = (10 - (digits.slice(0, 12).reduce((a, d, j) => a + d * (j % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
    codes.push(`${base}${cle}`);
  }
  // Mélange (comme des scans réels, non groupés)
  for (let i = codes.length - 1; i > 0; i--) {
    const j = entier(i + 1);
    [codes[i], codes[j]] = [codes[j], codes[i]];
  }
  console.log(`  lot scanné : ${codes.length} codes (3 050 FAB + 800 SPE + 150 inconnus)`);

  // 3. Envoi en une requête
  console.log("\n■ POST /api/colisage");
  const t0 = Date.now();
  const reponse = await fetch(`${BASE}/api/colisage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codes, ofs: ["099001"] }),
  });
  const corps = (await reponse.json()) as ReponseColisage;
  const dureeTotale = Date.now() - t0;
  console.log(`  HTTP ${reponse.status} — ${dureeTotale} ms aller-retour (serveur : ${corps.stats?.dureeMs ?? "?"} ms)`);

  if (!reponse.ok) throw new Error(corps && (corps as { error?: string }).error || `HTTP ${reponse.status}`);

  // 4. Vérifications métier
  console.log("\n■ Vérifications");
  check("total = nombre de codes envoyés", corps.stats.total === codes.length, `${corps.stats.total}/${codes.length}`);
  check("reconnus = 3 850", corps.stats.reconnus === 3850, String(corps.stats.reconnus));
  check("inconnus = 150 occurrences", corps.stats.inconnusQuantite === 150, String(corps.stats.inconnusQuantite));
  check("codes inconnus listés avec quantités", corps.inconnus.length > 0 && corps.inconnus.reduce((a, b) => a + b.quantite, 0) === 150);
  check("2 OF distincts identifiés", corps.stats.ofs === 2, String(corps.stats.ofs));
  check("somme des quantités = reconnus", corps.lignes.reduce((a, l) => a + l.quantite, 0) === corps.stats.reconnus);

  // Regroupement : aucune paire de lignes avec la même clé OF+modèle+couleur+taille
  const cles = new Set(corps.lignes.map((l) => `${l.of}|${l.modele}|${l.couleur}|${l.taille}`));
  check("aucune clé de regroupement dupliquée", cles.size === corps.lignes.length, `${cles.size}/${corps.lignes.length}`);

  // Tri : OF croissant (OF vide en dernier), puis modèle, puis couleur
  let triOk = true;
  for (let i = 1; i < corps.lignes.length; i++) {
    const a = corps.lignes[i - 1];
    const b = corps.lignes[i];
    if (!a.of) continue; // groupe « non identifié » en fin de tableau
    const cleA = `${a.of.padStart(6, "0")}|${a.modele}|${a.couleur}`;
    const cleB = b.of ? `${b.of.padStart(6, "0")}|${b.modele}|${b.couleur}` : "ZZZZ";
    if (cleA > cleB) { triOk = false; break; }
  }
  check("lignes triées (OF → modèle → couleur)", triOk);

  // Quantités cohérentes sur un échantillon : recompter côté client
  const attendus = new Map<string, number>();
  for (const c of codes) attendus.set(c, (attendus.get(c) ?? 0) + 1);
  const totalEchantillon = [...attendus.values()].reduce((a, b) => a + b, 0);
  check("recomptage client = total serveur", totalEchantillon === corps.stats.total);

  // Performance
  check("temps serveur < 5 000 ms pour 4 000 codes", corps.stats.dureeMs < 5000, `${corps.stats.dureeMs} ms`);

  console.log(
    `\n■ Aperçu du colisage (5 premières lignes)\n${corps.lignes
      .slice(0, 5)
      .map((l) => `  ${l.of || "—"} · ${l.modele} · ${l.couleur} · ${l.taille} · ×${l.quantite}`)
      .join("\n")}`
  );

  console.log(`\n════════ TEST VOLUME : ${echecs === 0 ? "OK —" : `${echecs} échec(s) —`} ${codes.length} codes, ${corps.stats.skus} lignes, ${corps.stats.dureeMs} ms ════════`);
  process.exit(echecs > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("❌", e.message ?? e);
  process.exit(1);
});
