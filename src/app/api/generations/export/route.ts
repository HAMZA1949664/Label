import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analyserPeriode } from "@/lib/periode-paris";

export const dynamic = "force-dynamic";

/** Échappe une valeur CSV (séparateur « ; », guillemets doublés si besoin). */
function champCsv(valeur: string | number): string {
  const s = String(valeur);
  if (/[";\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Horodatage du nom de fichier, fuseau Europe/Paris : AAAAMMJJ_HHmm. */
function horodatageFichier(d: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}_${p.hour}${p.minute}`;
}

/**
 * GET /api/generations/export
 * Exporte le journal (1 000 dernières entrées) au format CSV :
 * - séparateur « ; » (convention Excel FR) ;
 * - BOM UTF-8 pour un affichage correct des accents dans Excel ;
 * - colonnes : Date ; Type ; Fichier ; Étiquettes ; Modèle ; OF.
 * Les colonnes Modèle / OF sont extraites du champ « details » (JSON) s'il existe.
 * Paramètres facultatifs : ?depuis=AAAA-MM-JJ&jusqua=AAAA-MM-JJ (fuseau
 * Europe/Paris) → l'export se limite à la période sélectionnée dans le journal.
 */
export async function GET(req: Request) {
  try {
    const { where, erreur } = analyserPeriode(new URL(req.url));
    if (erreur) {
      return NextResponse.json({ error: erreur }, { status: 400 });
    }

    const entrees = await db.generationLog.findMany({
      ...(where ? { where } : {}),
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const fmtDate = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const lignes = entrees.map((e) => {
      let modele = "";
      let of = "";
      if (e.details) {
        try {
          const d = JSON.parse(e.details) as {
            modele?: string;
            of?: string;
            etiquettes?: Array<{ modele?: string; of?: string }>;
          };
          if (d.etiquettes && d.etiquettes.length > 0) {
            // Lot .NLBL : valeurs uniques jointes (tronquées à 80 caractères)
            const uniq = (xs: Array<string | undefined>) =>
              [...new Set(xs.filter((x): x is string => !!x))]
                .join(" / ")
                .slice(0, 80);
            modele = uniq(d.etiquettes.map((x) => x.modele));
            of = uniq(d.etiquettes.map((x) => x.of));
          } else {
            // Export .TXT journalisé côté client : { modele, of }
            modele = d.modele ?? "";
            of = d.of ?? "";
          }
        } catch {
          // details illisible : colonnes laissées vides
        }
      }
      return [
        fmtDate.format(e.createdAt),
        e.kind,
        e.filename,
        String(e.labelsCount),
        modele,
        of,
      ].map(champCsv).join(";");
    });

    const csv =
      "\uFEFF" + // BOM UTF-8 (Excel FR)
      ["Date;Type;Fichier;Étiquettes;Modèle;OF", ...lignes].join("\r\n") +
      "\r\n";

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="journal_generations_${horodatageFichier()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erreur export CSV du journal :", error);
    return NextResponse.json(
      { error: "Impossible d'exporter le journal." },
      { status: 500 }
    );
  }
}
