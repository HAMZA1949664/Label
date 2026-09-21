import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyserPeriode } from "@/lib/periode-paris";
import { empilerSync } from "@/lib/cloud/queue";

export const dynamic = "force-dynamic";

/** Entrée du journal enrichie (Modèle/OF extraits du JSON details). */
interface ItemJournal {
  id: string;
  kind: string;
  filename: string;
  labelsCount: number;
  createdAt: Date;
  modele?: string;
  of?: string;
  /** Vrai si l'entrée contient les 7 variables (régénération possible). */
  regenerable?: boolean;
  /** Étiquettes complètes d'un lot .NLBL (uniquement si regenerable). */
  etiquettes?: Array<{
    modele: string;
    type: string;
    of: string;
    codeBarre: string;
    couleur: string;
    manche: string;
    taille: string;
  }>;
}

/** Étiquette telle que journalisée dans details (selon la version). */
interface EtiquetteJournalisee {
  modele?: string;
  type?: string;
  of?: string;
  codeBarre?: string;
  couleur?: string;
  manche?: string;
  taille?: string;
}

/**
 * Extrait Modèle / OF du JSON details (deux formats journalisés) :
 * - TXT  : { modele, of }
 * - NLBL : { mode: "nlbl"|"zip", imprimante?, etiquettes: [{ modele, of, … }] }
 * Valeurs multiples (lot) jointes par « / » puis tronquées.
 * Pour les lots .NLBL, retourne aussi les étiquettes complètes si les 7
 * variables sont présentes (générations récentes) → régénération possible.
 */
function extraireDetails(details: string | null): {
  modele?: string;
  of?: string;
  regenerable?: boolean;
  etiquettes?: Array<{
    modele: string;
    type: string;
    of: string;
    codeBarre: string;
    couleur: string;
    manche: string;
    taille: string;
  }>;
} {
  if (!details) return {};
  try {
    const d = JSON.parse(details) as {
      modele?: string;
      of?: string;
      etiquettes?: EtiquetteJournalisee[];
    };
    if (Array.isArray(d.etiquettes) && d.etiquettes.length > 0) {
      const modeles = [...new Set(d.etiquettes.map((e) => e.modele).filter(Boolean))];
      const ofs = [...new Set(d.etiquettes.map((e) => e.of).filter(Boolean))];
      // Régénération possible uniquement si chaque étiquette porte les 7
      // variables (les générations plus anciennes omettaient manche/type).
      const completes = d.etiquettes.filter(
        (e) =>
          e.modele && e.type && e.of && e.codeBarre && e.couleur && e.taille
      ) as Array<{
        modele: string;
        type: string;
        of: string;
        codeBarre: string;
        couleur: string;
        manche: string;
        taille: string;
      }>;
      const regenerable = completes.length === d.etiquettes.length;
      return {
        modele: modeles.join(" / ").slice(0, 120) || undefined,
        of: ofs.join(" / ").slice(0, 60) || undefined,
        regenerable,
        ...(regenerable ? { etiquettes: completes } : {}),
      };
    }
    return {
      modele: d.modele ? d.modele.slice(0, 120) : undefined,
      of: d.of ? d.of.slice(0, 60) : undefined,
    };
  } catch {
    return {};
  }
}

/** Nombre d'entrées par page du journal. */
const TAILLE_PAGE = 20;

/**
 * GET /api/generations — journal paginé (TXT / NLBL), enrichi du Modèle et de
 * l'OF (recherche multi-critères côté interface).
 * Paramètres :
 * - ?page=0 (0-based) → 20 entrées + indicateur « encore » + total ;
 * - ?depuis=AAAA-MM-JJ&jusqua=AAAA-MM-JJ (facultatifs, fuseau Europe/Paris)
 *   → filtre les entrées sur la période choisie (le total est celui de la
 *   période, la pagination « Charger plus » la respecte).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pageDemandee = Number(url.searchParams.get("page") ?? "0");
    const page = Number.isInteger(pageDemandee) && pageDemandee > 0 ? pageDemandee : 0;

    const { where, erreur } = analyserPeriode(url);
    if (erreur) {
      return NextResponse.json({ error: erreur }, { status: 400 });
    }

    const [lignes, total] = await Promise.all([
      db.generationLog.findMany({
        ...(where ? { where } : {}),
        orderBy: { createdAt: "desc" },
        take: TAILLE_PAGE + 1, // +1 pour détecter une page suivante
        skip: page * TAILLE_PAGE,
      }),
      db.generationLog.count(where ? { where } : undefined),
    ]);

    const encore = lignes.length > TAILLE_PAGE;
    const visibles = encore ? lignes.slice(0, TAILLE_PAGE) : lignes;
    const items: ItemJournal[] = visibles.map(({ details, ...reste }) => ({
      ...reste,
      ...extraireDetails(details),
    }));
    return NextResponse.json({
      items,
      page,
      taillePage: TAILLE_PAGE,
      encore,
      total,
    });
  } catch (error) {
    console.error("Erreur lecture journal :", error);
    return NextResponse.json({ error: "Impossible de lire le journal." }, { status: 500 });
  }
}

/**
 * DELETE /api/generations — purge complète du journal (toutes les entrées).
 * Retourne le nombre d'entrées supprimées. Les fichiers déjà téléchargés
 * ne sont pas affectés : seul le suivi (historique + statistiques) est vidé.
 */
export async function DELETE() {
  try {
    const resultat = await db.generationLog.deleteMany();
    return NextResponse.json({ ok: true, supprimees: resultat.count });
  } catch (error) {
    console.error("Erreur purge journal :", error);
    return NextResponse.json(
      { error: "Impossible de vider le journal." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/generations — journalise une génération TXT côté client.
 * Corps : { kind, filename, labelsCount, details? }
 */
export async function POST(req: Request) {
  try {
    const corps = (await req.json()) as {
      kind?: string;
      filename?: string;
      labelsCount?: number;
      details?: string;
    };

    if (!corps.kind || !corps.filename || typeof corps.labelsCount !== "number") {
      return NextResponse.json({ error: "Données de journalisation incomplètes." }, { status: 400 });
    }

    const item = await db.generationLog.create({
      data: {
        kind: corps.kind === "NLBL" ? "NLBL" : "TXT",
        filename: corps.filename.slice(0, 200),
        labelsCount: Math.max(0, Math.trunc(corps.labelsCount)),
        details: (corps.details ?? "").slice(0, 6000) || null,
      },
    });

    // Miroir cloud : l'export .TXT (ancien flux) est aussi une impression —
    // enregistrée dans la base Supabase partagée (file non bloquante).
    void empilerSync("print_events", [
      {
        local_id: item.id,
        kind: item.kind,
        filename: item.filename,
        labels_count: item.labelsCount,
        details: (corps.details ?? "").slice(0, 3000) || null,
        event_at: item.createdAt.toISOString(),
      },
    ]);

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Erreur journalisation :", error);
    return NextResponse.json({ error: "Journalisation impossible." }, { status: 500 });
  }
}
