import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/generations/[id] — supprime une entrée du journal des générations.
 * Réponses :
 * - 200 : { ok: true, id } après suppression ;
 * - 400 : identifiant manquant ;
 * - 404 : entrée introuvable (déjà supprimée) ;
 * - 500 : erreur de base de données.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id || typeof id !== "string" || id.trim().length === 0) {
      return NextResponse.json(
        { error: "Identifiant d'entrée manquant." },
        { status: 400 }
      );
    }

    const existante = await db.generationLog.findUnique({ where: { id } });
    if (!existante) {
      return NextResponse.json(
        { error: "Entrée introuvable (déjà supprimée ?)." },
        { status: 404 }
      );
    }

    await db.generationLog.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("Erreur suppression entrée journal :", error);
    return NextResponse.json(
      { error: "Suppression impossible." },
      { status: 500 }
    );
  }
}
