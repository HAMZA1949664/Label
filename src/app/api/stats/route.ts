import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface JourStat {
  /** Clé ISO locale du jour, ex. 2025-09-21 */
  jour: string;
  /** Libellé court en français, ex. « dim. 21 » */
  libelle: string;
  txt: number;
  nlbl: number;
  /** Étiquettes contenues dans les fichiers .nlbl générés ce jour */
  etiquettes: number;
}

/** Ligne du classement des modèles les plus générés sur la période. */
interface ModeleStat {
  modele: string;
  /** Nombre de fichiers distincts journalisés pour ce modèle. */
  fichiers: number;
  /** Nombre total d'étiquettes (lots et copies compris). */
  etiquettes: number;
}

/** Nombre maximum de modèles affichés dans le classement. */
const TOP_MODELES_TAILLE = 5;

/**
 * GET /api/stats?jours=7
 * Statistiques d'activité du journal de générations :
 * - totaux cumulés (fichiers TXT/NLBL, étiquettes) ;
 * - répartition par jour sur la période choisie (7, 14 ou 30 derniers jours,
 *   fuseau Europe/Paris ; 7 par défaut).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const joursDemandes = Number(url.searchParams.get("jours") ?? "7");
    const jours = [7, 14, 30].includes(joursDemandes) ? joursDemandes : 7;

    const maintenant = new Date();
    const depuis = new Date(
      maintenant.getTime() - (jours - 1) * 24 * 60 * 60 * 1000
    );
    depuis.setHours(0, 0, 0, 0);

    const [entrees, nlblAgg] = await Promise.all([
      db.generationLog.findMany({
        where: { createdAt: { gte: depuis } },
        select: { kind: true, labelsCount: true, createdAt: true, details: true },
        orderBy: { createdAt: "asc" },
      }),
      db.generationLog.groupBy({
        by: ["kind"],
        _sum: { labelsCount: true },
        _count: { _all: true },
      }),
    ]);

    // Clé de jour en heure locale Europe/Paris (format YYYY-MM-DD)
    const cleJour = (d: Date) =>
      new Intl.DateTimeFormat("fr-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);

    const libelleJour = (d: Date) =>
      new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        weekday: "short",
        day: "2-digit",
      }).format(d);

    // Grille des N derniers jours (même en l'absence de données)
    const parJour = new Map<string, JourStat>();
    for (let i = 0; i < jours; i++) {
      const d = new Date(depuis.getTime() + i * 24 * 60 * 60 * 1000);
      const cle = cleJour(d);
      parJour.set(cle, {
        jour: cle,
        libelle: libelleJour(d),
        txt: 0,
        nlbl: 0,
        etiquettes: 0,
      });
    }

    let semaineTxt = 0;
    let semaineNlbl = 0;
    let semaineEtiquettes = 0;

    for (const e of entrees) {
      const stat = parJour.get(cleJour(e.createdAt));
      if (!stat) continue;
      if (e.kind === "NLBL") {
        stat.nlbl += 1;
        stat.etiquettes += e.labelsCount;
        semaineNlbl += 1;
        semaineEtiquettes += e.labelsCount;
      } else {
        stat.txt += 1;
        semaineTxt += 1;
      }
    }

    const nlblLigne = nlblAgg.find((g) => g.kind === "NLBL");
    const txtLigne = nlblAgg.find((g) => g.kind === "TXT");

    // ----- Classement des modèles les plus générés sur la période -----
    // Le modèle provient du JSON details : { modele } (TXT) ou
    // { etiquettes: [{ modele, … }] } (NLBL, toutes les valeurs d'un lot).
    const accumulateurModeles = new Map<
      string,
      { fichiers: number; etiquettes: number }
    >();
    for (const e of entrees) {
      let modeles: string[] = [];
      try {
        const d = e.details
          ? (JSON.parse(e.details) as {
              modele?: string;
              etiquettes?: Array<{ modele?: string }>;
            })
          : null;
        if (Array.isArray(d?.etiquettes) && d.etiquettes.length > 0) {
          modeles = d.etiquettes
            .map((x) => (x.modele ?? "").trim())
            .filter(Boolean);
        } else if (d?.modele?.trim()) {
          modeles = [d.modele.trim()];
        }
      } catch {
        // détail illisible : on ignore simplement cette entrée du classement
      }
      // Dédoublonnage à l'intérieur d'une même entrée (un fichier = une ligne)
      const uniques = [...new Set(modeles)];
      for (const modele of uniques) {
        const courant = accumulateurModeles.get(modele) ?? {
          fichiers: 0,
          etiquettes: 0,
        };
        courant.fichiers += 1;
        courant.etiquettes += e.labelsCount;
        accumulateurModeles.set(modele, courant);
      }
    }
    const topModeles: ModeleStat[] = [...accumulateurModeles.entries()]
      .map(([modele, v]) => ({ modele, ...v }))
      .sort(
        (a, b) =>
          b.etiquettes - a.etiquettes ||
          b.fichiers - a.fichiers ||
          a.modele.localeCompare(b.modele, "fr")
      )
      .slice(0, TOP_MODELES_TAILLE);

    return NextResponse.json({
      jours,
      totalTxt: txtLigne?._count._all ?? 0,
      totalNlbl: nlblLigne?._count._all ?? 0,
      totalEtiquettes: nlblLigne?._sum.labelsCount ?? 0,
      semaineTxt,
      semaineNlbl,
      semaineEtiquettes,
      parJour: [...parJour.values()],
      topModeles,
    });
  } catch (error) {
    console.error("Erreur calcul statistiques :", error);
    return NextResponse.json(
      { error: "Impossible de calculer les statistiques." },
      { status: 500 }
    );
  }
}
