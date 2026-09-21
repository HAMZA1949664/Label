import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sleeveAbbrev, couleurLabel, mancheLabel, tailleCourte } from "@/lib/label-data";
import {
  chargerCatalogue,
  construireIndexSpeGlobal,
} from "@/lib/label-records";
import {
  MAX_CODES_COLISAGE,
  trierLignesColisage,
  type LigneColisage,
  type ResultatColisage,
} from "@/lib/colisage";

export const dynamic = "force-dynamic";

interface ErreurApi {
  error: string;
}

/**
 * POST /api/colisage
 * Corps : { codes: string[], ofs?: string[] }
 * Retourne le colisage regroupé (OF → modèle → couleur → taille) avec
 * quantités, la liste des codes inconnus et des statistiques.
 * Conçu pour 3 000 à 4 000 codes scannés en une seule requête.
 */
export async function POST(req: Request) {
  const debut = Date.now();

  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    const reponse: ErreurApi = { error: "Corps de requête JSON invalide." };
    return NextResponse.json(reponse, { status: 400 });
  }

  const { codes } = (corps ?? {}) as { codes?: unknown; ofs?: unknown };

  if (!Array.isArray(codes) || codes.length === 0) {
    return NextResponse.json(
      { error: "Aucun code-barres fourni. Collez ou importez d'abord des codes." },
      { status: 400 }
    );
  }
  if (codes.length > MAX_CODES_COLISAGE) {
    return NextResponse.json(
      {
        error: `Trop de codes reçus (${codes.length}). Maximum : ${MAX_CODES_COLISAGE.toLocaleString("fr-FR")}.`,
      },
      { status: 400 }
    );
  }

  // Normalisation : chaînes de 13 chiffres uniquement
  const codesPropres: string[] = [];
  for (const c of codes) {
    if (typeof c === "string" && /^\d{13}$/.test(c.trim())) {
      codesPropres.push(c.trim());
    }
  }
  if (codesPropres.length === 0) {
    return NextResponse.json(
      { error: "Aucun code-barres valide (13 chiffres) dans les données reçues." },
      { status: 400 }
    );
  }

  // OF additionnels fournis par l'opérateur (aide au décodage des codes SPE)
  const ofsSaisis: string[] = Array.isArray((corps as { ofs?: unknown }).ofs)
    ? ((corps as { ofs: unknown[] }).ofs.filter(
        (o): o is string => typeof o === "string"
      ) as string[])
    : [];

  try {
    // 1. Catalogue complet + index FAB par code-barres (O(1) par scan)
    const { lignes, fabParCode } = await chargerCatalogue();

    // 1 bis. Mémoire permanente des étiquettes générées : résolution directe
    // des codes produits par l'application (SPE notamment) par simple lecture
    // en base — l'OF est celui de la génération, sans recalcul ni heuristique.
    const labelParCode = new Map<
      string,
      {
        of: string;
        modele: string;
        couleur: string;
        couleurCode: string;
        taille: string;
        manche: string;
      }
    >();
    const aChercher = [
      ...new Set(codesPropres.filter((c) => !fabParCode.has(c))),
    ];
    for (let i = 0; i < aChercher.length; i += 500) {
      const morceau = aChercher.slice(i, i + 500);
      const enregistrements = await db.labelRecord.findMany({
        where: { codeBarre: { in: morceau } },
        select: {
          codeBarre: true,
          of: true,
          modele: true,
          couleur: true,
          couleurCode: true,
          taille: true,
          manche: true,
        },
      });
      for (const r of enregistrements) {
        if (!labelParCode.has(r.codeBarre)) {
          labelParCode.set(r.codeBarre, {
            of: r.of,
            modele: r.modele,
            couleur: r.couleur,
            couleurCode: r.couleurCode,
            taille: r.taille,
            manche: r.manche,
          });
        }
      }
    }

    // 2. Index SPE (codes recalculés, cache partagé versionné par catalogue) —
    //    repli pour les codes absents de la mémoire des étiquettes générées.
    const speIndexGlobal = await construireIndexSpeGlobal(lignes, ofsSaisis);

    // 3. Regroupement OF → modèle → couleur → taille, comptage des occurrences
    interface Groupe extends LigneColisage {
      article: string;
      mancheBrute: string;
    }
    const groupes = new Map<string, Groupe>();
    const inconnus = new Map<string, number>();
    let reconnus = 0;

    for (const code of codesPropres) {
      const fab = fabParCode.get(code);
      if (fab) {
        reconnus++;
        const cle = `|${fab.article}|${fab.couleur}|${fab.taille}|${fab.manche}`;
        const existant = groupes.get(cle);
        if (existant) existant.quantite += 1;
        else {
          const abbrev = sleeveAbbrev(fab.manche);
          groupes.set(cle, {
            of: "",
            article: fab.article,
            modele: `${fab.article}${abbrev ? ` ${abbrev}` : ""}`,
            couleur: couleurLabel(fab.couleur)[0],
            couleurCode: fab.couleur,
            taille: tailleCourte(fab.taille)[0],
            manche: mancheLabel(fab.manche)?.[0] ?? "",
            mancheBrute: fab.manche,
            quantite: 1,
          });
        }
        continue;
      }
      const enregistre = labelParCode.get(code);
      if (enregistre) {
        reconnus++;
        const cle = `E|${enregistre.of}|${enregistre.modele}|${enregistre.couleur}|${enregistre.taille}|${enregistre.manche}`;
        const existant = groupes.get(cle);
        if (existant) existant.quantite += 1;
        else {
          groupes.set(cle, {
            of: enregistre.of,
            article: "",
            modele: enregistre.modele,
            couleur: enregistre.couleur,
            couleurCode: enregistre.couleurCode,
            taille: enregistre.taille,
            manche: enregistre.manche,
            mancheBrute: "",
            quantite: 1,
          });
        }
        continue;
      }
      const spe = speIndexGlobal.get(code);
      if (spe) {
        reconnus++;
        const { ref, of } = spe;
        const cle = `${of}|${ref.article}|${ref.couleur}|${ref.taille}|${ref.manche}`;
        const existant = groupes.get(cle);
        if (existant) existant.quantite += 1;
        else {
          const abbrev = sleeveAbbrev(ref.manche);
          groupes.set(cle, {
            of,
            article: ref.article,
            modele: `${ref.article}${abbrev ? ` ${abbrev}` : ""} SPE`,
            couleur: couleurLabel(ref.couleur)[0],
            couleurCode: ref.couleur,
            taille: tailleCourte(ref.taille)[0],
            manche: mancheLabel(ref.manche)?.[0] ?? "",
            mancheBrute: ref.manche,
            quantite: 1,
          });
        }
        continue;
      }
      inconnus.set(code, (inconnus.get(code) ?? 0) + 1);
    }

    // 4. Tri logique + statistiques
    const lignesTriees = trierLignesColisage([...groupes.values()]).map(
      ({ article: _article, mancheBrute: _mancheBrute, ...ligne }) => ligne
    );
    const inconnusTries = [...inconnus.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code, quantite]) => ({ code, quantite }));

    const ofsDistincts = new Set(lignesTriees.map((l) => l.of).filter(Boolean));
    const resultat: ResultatColisage = {
      lignes: lignesTriees,
      inconnus: inconnusTries,
      stats: {
        total: codesPropres.length,
        reconnus,
        inconnusQuantite: codesPropres.length - reconnus,
        skus: lignesTriees.length,
        ofs: ofsDistincts.size,
        quantite: reconnus,
        dureeMs: Date.now() - debut,
      },
    };

    return NextResponse.json(resultat, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Erreur génération colisage :", error);
    return NextResponse.json(
      { error: "Échec de la génération du colisage (erreur serveur)." },
      { status: 500 }
    );
  }
}
