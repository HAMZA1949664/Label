/**
 * Backfill — remplissage de la mémoire des étiquettes générées (LabelRecord)
 * depuis le journal des générations .NLBL (GenerationLog.details).
 *
 * Autonome (aucune dépendance au serveur Next) : n'importe que les fonctions
 * pures de label-data. Idempotent : les lots déjà importés (filename présent
 * en base) sont ignorés.
 * Exécution : bun scripts/backfill-label-records.ts
 */

import { PrismaClient } from "@prisma/client";
import {
  couleurLabel,
  mancheLabel,
  sleeveAbbrev,
  speBarcode,
  tailleCourte,
} from "../src/lib/label-data";

const db = new PrismaClient();

// --- Résolution canonique (copie fidèle de src/lib/label-records.ts) ---

interface LigneCatalogue {
  article: string;
  couleur: string;
  taille: string;
  manche: string;
  codeBarre: string;
}

interface EtiquetteGeneree {
  modele: string;
  type: string;
  of: string;
  codeBarre: string;
  couleur: string;
  manche: string;
  taille: string;
}

function modeleComplet(article: string, mancheBrute: string, spe: boolean): string {
  const abbrev = sleeveAbbrev(mancheBrute);
  return `${article}${abbrev ? ` ${abbrev}` : ""}${spe ? " SPE" : ""}`;
}

function champsDepuisCatalogue(
  ligne: LigneCatalogue,
  of: string,
  spe: boolean
) {
  return {
    codeBarre: ligne.codeBarre,
    article: ligne.article,
    modele: modeleComplet(ligne.article, ligne.manche, spe),
    couleur: couleurLabel(ligne.couleur)[0],
    couleurCode: ligne.couleur,
    taille: tailleCourte(ligne.taille)[0],
    manche: mancheLabel(ligne.manche)?.[0] ?? "",
    of: of ?? "",
    source: spe ? "SPE" : "FAB",
  };
}

function champsDepuisAffichage(e: EtiquetteGeneree) {
  const fr = (v: string) => (v.includes(" / ") ? (v.split(" / ")[1] ?? v) : v);
  const spe = / SPE$/i.test(e.modele.trim());
  return {
    codeBarre: e.codeBarre,
    article: e.modele.replace(/\s*SPE$/i, "").trim(),
    modele: e.modele,
    couleur: fr(e.couleur),
    couleurCode: "",
    taille: fr(e.taille),
    manche: fr(e.manche ?? ""),
    of: e.of ?? "",
    source: spe || e.codeBarre.startsWith("99") ? "SPE" : "EXT",
  };
}

function resoudreEtiquette(
  e: EtiquetteGeneree,
  fabParCode: Map<string, LigneCatalogue>,
  speParCode: Map<string, LigneCatalogue> | null
) {
  const fab = fabParCode.get(e.codeBarre);
  if (fab) return champsDepuisCatalogue(fab, e.of, false);
  const spe = speParCode?.get(e.codeBarre);
  if (spe) return champsDepuisCatalogue(spe, e.of, true);
  return champsDepuisAffichage(e);
}

// --- Backfill ---

async function main() {
  const lignes = (await db.article.findMany({
    select: {
      article: true,
      couleur: true,
      taille: true,
      manche: true,
      codeBarre: true,
    },
  })) as LigneCatalogue[];
  const fabParCode = new Map<string, LigneCatalogue>();
  for (const l of lignes) fabParCode.set(l.codeBarre, l);

  const dejaImportes = new Set(
    (
      await db.labelRecord.findMany({ select: { filename: true } })
    ).map((r) => r.filename)
  );

  const journaux = await db.generationLog.findMany({
    where: { kind: "NLBL" },
    orderBy: { createdAt: "asc" },
    select: { id: true, filename: true, details: true, createdAt: true },
  });

  let lotsImportes = 0;
  let etiquettesImportees = 0;
  let lotsDejaLa = 0;
  let lotsSansDetails = 0;

  for (const j of journaux) {
    if (dejaImportes.has(j.filename)) {
      lotsDejaLa++;
      continue;
    }
    if (!j.details) {
      lotsSansDetails++;
      continue;
    }
    let etiquettes: Array<Record<string, unknown>> = [];
    try {
      const details = JSON.parse(j.details) as { etiquettes?: unknown };
      if (Array.isArray(details.etiquettes)) {
        etiquettes = details.etiquettes as Array<Record<string, unknown>>;
      }
    } catch {
      lotsSansDetails++;
      continue;
    }
    if (etiquettes.length === 0) {
      lotsSansDetails++;
      continue;
    }

    // Index SPE limité aux OF du lot (résolution inverse exacte).
    const ofsDuLot = new Set<string>();
    for (const e of etiquettes) {
      const of = typeof e.of === "string" ? e.of : "";
      if (of && /^\d{1,20}$/.test(of)) ofsDuLot.add(of);
    }
    const speParCode = new Map<string, LigneCatalogue>();
    for (const of of ofsDuLot) {
      for (const l of lignes) {
        speParCode.set(speBarcode(l.article, l.couleur, l.manche, l.taille, of), l);
      }
    }

    const records: Array<{
      codeBarre: string;
      article: string;
      modele: string;
      couleur: string;
      couleurCode: string;
      taille: string;
      manche: string;
      of: string;
      type: string;
      source: string;
      quantite: number;
      filename: string;
      createdAt: Date;
    }> = [];

    for (const e of etiquettes) {
      const etiquette: EtiquetteGeneree = {
        modele: String(e.modele ?? ""),
        type: String(e.type ?? ""),
        of: String(e.of ?? ""),
        codeBarre: String(e.codeBarre ?? ""),
        couleur: String(e.couleur ?? ""),
        manche: String(e.manche ?? ""),
        taille: String(e.taille ?? ""),
      };
      if (!/^\d{13}$/.test(etiquette.codeBarre)) continue;
      const champs = resoudreEtiquette(etiquette, fabParCode, speParCode);
      records.push({
        ...champs,
        type: etiquette.type,
        quantite: 1,
        filename: j.filename,
        createdAt: j.createdAt,
      });
    }

    if (records.length > 0) {
      await db.labelRecord.createMany({ data: records });
      lotsImportes++;
      etiquettesImportees += records.length;
      dejaImportes.add(j.filename);
    } else {
      lotsSansDetails++;
    }
  }

  const speEnBase = await db.labelRecord.count({ where: { source: "SPE" } });
  const total = await db.labelRecord.count();

  console.log(
    `Backfill terminé — lots importés : ${lotsImportes} (${etiquettesImportees} étiquettes), déjà présents : ${lotsDejaLa}, sans détails : ${lotsSansDetails}.`
  );
  console.log(
    `LabelRecord total : ${total} (dont ${speEnBase} SPE). Catalogue : ${lignes.length} lignes.`
  );

  // Auto-test : un code SPE en base doit se recalculer depuis le catalogue.
  const echantillon = await db.labelRecord.findFirst({ where: { source: "SPE" } });
  if (echantillon) {
    const trouve = lignes.find(
      (l) =>
        speBarcode(l.article, l.couleur, l.manche, l.taille, echantillon.of) ===
        echantillon.codeBarre
    );
    const modeleAttendu = trouve
      ? modeleComplet(trouve.article, trouve.manche, true)
      : "?";
    console.log(
      `Auto-test SPE : ${echantillon.codeBarre} → ${modeleAttendu} (${echantillon.couleur} ${echantillon.taille}) — ${modeleAttendu === echantillon.modele ? "COHÉRENT" : "ÉCART à vérifier"}`
    );
  }
}

main()
  .catch((e) => {
    console.error("Backfill échoué :", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
