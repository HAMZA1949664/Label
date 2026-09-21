import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles
 * Retourne l'intégralité du catalogue de références au format compact
 * [article, couleur, taille, manche, codeBarre] (même structure que l'original).
 */
export async function GET() {
  try {
    const rows = await db.article.findMany({
      orderBy: [{ article: "asc" }, { couleur: "asc" }, { taille: "asc" }, { codeBarre: "asc" }],
      select: { article: true, couleur: true, taille: true, manche: true, codeBarre: true },
    });

    const records = rows.map((r) => [r.article, r.couleur, r.taille, r.manche, r.codeBarre]);
    return NextResponse.json({ records, total: records.length });
  } catch (error) {
    console.error("Erreur lecture catalogue :", error);
    return NextResponse.json(
      { error: "Impossible de charger le catalogue d'articles." },
      { status: 500 }
    );
  }
}
