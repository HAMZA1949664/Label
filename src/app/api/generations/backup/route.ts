import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Nombre maximum d'entrées acceptées lors d'une restauration. */
const MAX_IMPORT = 2000;

/** Entrée de journal acceptée dans un fichier de sauvegarde. */
interface EntreeSauvegarde {
  id?: unknown;
  kind?: unknown;
  filename?: unknown;
  labelsCount?: unknown;
  details?: unknown;
  createdAt?: unknown;
}

/** Horodatage AAAAMMJJ_HHmm (fuseau local) pour nommer le fichier de sauvegarde. */
function horodatage(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * GET /api/generations/backup — sauvegarde complète du journal au format JSON.
 * Le fichier téléchargé contient TOUTES les entrées (sans pagination) et peut
 * être restauré plus tard via POST (doublons ignorés automatiquement).
 */
export async function GET() {
  try {
    const entrees = await db.generationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: MAX_IMPORT,
    });
    const corps = {
      application: "clément-design-generateur-etiquettes",
      version: 1,
      exporteLe: new Date().toISOString(),
      total: entrees.length,
      entrees,
    };
    const nomFichier = `journal_etiquettes_${horodatage()}.json`;
    return new NextResponse(JSON.stringify(corps, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erreur sauvegarde journal :", error);
    return NextResponse.json(
      { error: "Impossible de sauvegarder le journal." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/generations/backup — restaure un fichier de sauvegarde JSON.
 * Corps : { entrees: [{ id?, kind, filename, labelsCount, details?, createdAt }] }
 * Les entrées déjà présentes (identifiant ou couple fichier + date identique)
 * sont ignorées : la restauration est idempotente et peut être rejouée.
 */
export async function POST(req: Request) {
  try {
    const corps = (await req.json()) as { entrees?: EntreeSauvegarde[] };
    if (!Array.isArray(corps.entrees) || corps.entrees.length === 0) {
      return NextResponse.json(
        { error: "Fichier de sauvegarde invalide (aucune entrée trouvée)." },
        { status: 400 }
      );
    }
    if (corps.entrees.length > MAX_IMPORT) {
      return NextResponse.json(
        {
          error: `Trop d'entrées (${corps.entrees.length}) — maximum ${MAX_IMPORT} par restauration.`,
        },
        { status: 400 }
      );
    }

    // Journal actuel : identifiants et empreintes (fichier + date) connus
    const existants = await db.generationLog.findMany({
      select: { id: true, filename: true, createdAt: true },
    });
    const idsConnus = new Set(existants.map((e) => e.id));
    const empreintesConnues = new Set(
      existants.map((e) => `${e.filename}|${e.createdAt.toISOString()}`)
    );

    const nouvelles: Array<{
      id?: string;
      kind: string;
      filename: string;
      labelsCount: number;
      details: string | null;
      createdAt: Date;
    }> = [];
    let ignorees = 0;

    for (const e of corps.entrees) {
      // Validations de surface (les entrées mal formées sont comptées ignorées)
      const kind = e.kind === "NLBL" ? "NLBL" : e.kind === "TXT" ? "TXT" : null;
      const filename =
        typeof e.filename === "string" && e.filename.trim()
          ? e.filename.trim().slice(0, 200)
          : null;
      const labelsCount =
        typeof e.labelsCount === "number" && Number.isFinite(e.labelsCount)
          ? Math.max(0, Math.trunc(e.labelsCount))
          : null;
      const date = typeof e.createdAt === "string" ? new Date(e.createdAt) : null;
      if (!kind || !filename || labelsCount === null || !date || isNaN(date.getTime())) {
        ignorees += 1;
        continue;
      }
      const id =
        typeof e.id === "string" && e.id.length > 0 && e.id.length <= 64 ? e.id : undefined;
      // Déduplication : identifiant déjà présent, ou fichier + horodatage identiques
      if ((id && idsConnus.has(id)) || empreintesConnues.has(`${filename}|${date.toISOString()}`)) {
        ignorees += 1;
        continue;
      }
      // Mémorise l'empreinte pour dédoublonner aussi les doublons internes au fichier
      if (id) idsConnus.add(id);
      empreintesConnues.add(`${filename}|${date.toISOString()}`);
      nouvelles.push({
        ...(id ? { id } : {}),
        kind,
        filename,
        labelsCount,
        details:
          typeof e.details === "string" && e.details ? e.details.slice(0, 6000) : null,
        createdAt: date,
      });
    }

    // Insertions (boucle create : volumes modestes, pas de createMany sur SQLite)
    for (const n of nouvelles) {
      const { id, ...data } = n;
      await db.generationLog.create({ data: id ? { ...data, id } : data });
    }

    return NextResponse.json({
      ok: true,
      ajoutees: nouvelles.length,
      ignorees,
      total: await db.generationLog.count(),
    });
  } catch (error) {
    console.error("Erreur restauration journal :", error);
    return NextResponse.json(
      { error: "Restauration impossible : fichier de sauvegarde illisible." },
      { status: 500 }
    );
  }
}
