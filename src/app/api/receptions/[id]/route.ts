import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { construireEtatReception } from "@/lib/receptions-server";
import { empilerSync } from "@/lib/cloud/queue";
import { exigerRoleFrance } from "@/lib/cloud/session";

export const dynamic = "force-dynamic";

interface ErreurApi {
  error: string;
}

/**
 * GET /api/receptions/[id] — état complet d'une réception prévue :
 * lignes attendues avec quantités reçues (pointages cumulés), écarts,
 * codes hors prévue et inconnus, résumé global.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth active : la réception/colisage est réservée au compte France.
    const garde = await exigerRoleFrance();
    if (garde) return NextResponse.json({ error: garde }, { status: 403 });
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Identifiant de réception manquant." },
        { status: 400 }
      );
    }
    const etat = await construireEtatReception(id);
    if (!etat) {
      return NextResponse.json(
        { error: "Réception introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json(etat, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Lecture de la réception impossible :", error);
    return NextResponse.json(
      { error: "Lecture de la réception impossible (erreur serveur)." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/receptions/[id] — met à jour la réception :
 * { statut: "cloturee" | "ouverte" } (clôture logistique : le pointage est
 * alors verrouillé) et/ou { titre, note }.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth active : la clôture/l'édition d'une réception est réservée à la France.
    const garde = await exigerRoleFrance();
    if (garde) return NextResponse.json({ error: garde }, { status: 403 });
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Identifiant de réception manquant." },
        { status: 400 }
      );
    }
    const corps = (await req.json().catch(() => ({}))) as {
      statut?: unknown;
      titre?: unknown;
      note?: unknown;
    };

    const data: {
      statut?: string;
      clotureAt?: Date | null;
      titre?: string;
      note?: string | null;
    } = {};

    if (corps.statut !== undefined) {
      if (corps.statut !== "cloturee" && corps.statut !== "ouverte") {
        return NextResponse.json(
          { error: "Statut invalide (attendu : « ouverte » ou « cloturee »)." },
          { status: 400 }
        );
      }
      data.statut = corps.statut;
      data.clotureAt = corps.statut === "cloturee" ? new Date() : null;
    }
    if (typeof corps.titre === "string") {
      const titre = corps.titre.trim();
      if (titre.length === 0 || titre.length > 120) {
        return NextResponse.json(
          { error: "Titre invalide (1 à 120 caractères)." },
          { status: 400 }
        );
      }
      data.titre = titre;
    }
    if (typeof corps.note === "string") {
      data.note = corps.note.trim() || null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Aucune modification fournie." },
        { status: 400 }
      );
    }

    const existante = await db.reception.findUnique({ where: { id } });
    if (!existante) {
      return NextResponse.json(
        { error: "Réception introuvable." },
        { status: 404 }
      );
    }

    await db.reception.update({ where: { id }, data });

    // Miroir cloud : statut (clôture/rouverture), titre et note partagés.
    const maj = await db.reception.findUnique({
      where: { id },
      select: { id: true, titre: true, statut: true, note: true, createdAt: true, clotureAt: true },
    });
    if (maj) {
      void empilerSync("receptions", [
        {
          local_id: maj.id,
          titre: maj.titre,
          statut: maj.statut,
          note: maj.note,
          cree_at: maj.createdAt.toISOString(),
          cloture_at: maj.clotureAt ? maj.clotureAt.toISOString() : null,
        },
      ]);
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("Mise à jour de la réception impossible :", error);
    return NextResponse.json(
      { error: "Mise à jour de la réception impossible (erreur serveur)." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/receptions/[id] — supprime la réception (lignes et pointages
 * associés, par cascade). Les étiquettes générées (LabelRecord) sont
 * conservées : elles appartiennent à l'historique de production.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth active : la suppression d'une réception est réservée à la France.
    const garde = await exigerRoleFrance();
    if (garde) return NextResponse.json({ error: garde }, { status: 403 });
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Identifiant de réception manquant." },
        { status: 400 }
      );
    }
    const existante = await db.reception.findUnique({ where: { id } });
    if (!existante) {
      return NextResponse.json(
        { error: "Réception introuvable (déjà supprimée ?)." },
        { status: 404 }
      );
    }
    await db.reception.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("Suppression de la réception impossible :", error);
    return NextResponse.json(
      { error: "Suppression de la réception impossible (erreur serveur)." },
      { status: 500 }
    );
  }
}
