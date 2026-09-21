import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MAX_CODES_COLISAGE } from "@/lib/colisage";
import { construireEtatReception } from "@/lib/receptions-server";
import { empilerSync } from "@/lib/cloud/queue";
import { exigerRoleFrance } from "@/lib/cloud/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/receptions/[id]/pointer
 * Corps : { codes: string[] } — codes-barres scannés (13 chiffres, doublons
 * conservés : chaque occurrence = une pièce).
 *
 * Pointage multi-sessions : les quantités par code sont fusionnées en base
 * (ScanRecord). Re-pointer le même code plus tard ajoute ses occurrences —
 * c'est le comportement voulu (nouvelles pièces reçues entre-temps).
 * Réponse : l'état complet mis à jour de la réception (attendu / reçu / écart).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth active : le pointage de scans (colisage) est réservé au compte France.
    const garde = await exigerRoleFrance();
    if (garde) return NextResponse.json({ error: garde }, { status: 403 });
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Identifiant de réception manquant." },
        { status: 400 }
      );
    }

    const reception = await db.reception.findUnique({
      where: { id },
      select: { id: true, statut: true },
    });
    if (!reception) {
      return NextResponse.json(
        { error: "Réception introuvable." },
        { status: 404 }
      );
    }
    if (reception.statut === "cloturee") {
      return NextResponse.json(
        {
          error:
            "Réception clôturée : le pointage est verrouillé. Rouvrez-la si nécessaire.",
        },
        { status: 409 }
      );
    }

    const corps = (await req.json().catch(() => null)) as {
      codes?: unknown;
    } | null;
    const codesBruts = corps?.codes;
    if (!Array.isArray(codesBruts) || codesBruts.length === 0) {
      return NextResponse.json(
        { error: "Aucun code fourni : analysez d'abord un lot de codes scannés." },
        { status: 400 }
      );
    }
    if (codesBruts.length > MAX_CODES_COLISAGE) {
      return NextResponse.json(
        {
          error: `Trop de codes (${codesBruts.length}). Maximum : ${MAX_CODES_COLISAGE.toLocaleString("fr-FR")}.`,
        },
        { status: 400 }
      );
    }

    // Normalisation + comptage des occurrences (une occurrence = une pièce).
    const occurrences = new Map<string, number>();
    let total = 0;
    for (const c of codesBruts) {
      if (typeof c === "string" && /^\d{13}$/.test(c.trim())) {
        const code = c.trim();
        occurrences.set(code, (occurrences.get(code) ?? 0) + 1);
        total += 1;
      }
    }
    if (total === 0) {
      return NextResponse.json(
        { error: "Aucun code-barres valide (13 chiffres) dans le lot fourni." },
        { status: 400 }
      );
    }

    // Fusion en base : création des nouveaux codes, incrément des existants.
    const codes = [...occurrences.keys()];
    const existants = new Map<string, { codeBarre: string; quantite: number }>();
    for (let i = 0; i < codes.length; i += 500) {
      const morceau = codes.slice(i, i + 500);
      const trouves = await db.scanRecord.findMany({
        where: { receptionId: id, codeBarre: { in: morceau } },
        select: { codeBarre: true, quantite: true },
      });
      for (const t of trouves) existants.set(t.codeBarre, t);
    }

    const nouveaux = codes
      .filter((c) => !existants.has(c))
      .map((codeBarre) => ({ receptionId: id, codeBarre, quantite: occurrences.get(codeBarre) ?? 0 }));

    await db.$transaction(async (tx) => {
      for (let i = 0; i < nouveaux.length; i += 500) {
        await tx.scanRecord.createMany({ data: nouveaux.slice(i, i + 500) });
      }
      for (const [code, quantite] of occurrences) {
        if (existants.has(code)) {
          await tx.scanRecord.update({
            where: { receptionId_codeBarre: { receptionId: id, codeBarre: code } },
            data: { quantite: { increment: quantite } },
          });
        }
      }
    });

    const etat = await construireEtatReception(id);
    if (!etat) {
      return NextResponse.json(
        { error: "Réception introuvable après pointage." },
        { status: 404 }
      );
    }

    // Miroir cloud : quantités FINALES par code (cumul multi-sessions)
    // partagées dans la base Supabase — lecture par paquets (SQLite in).
    const scansFinaux: Array<{
      id: string;
      codeBarre: string;
      quantite: number;
      createdAt: Date;
      updatedAt: Date;
    }> = [];
    for (let i = 0; i < codes.length; i += 500) {
      const morceau = await db.scanRecord.findMany({
        where: { receptionId: id, codeBarre: { in: codes.slice(i, i + 500) } },
        select: { id: true, codeBarre: true, quantite: true, createdAt: true, updatedAt: true },
      });
      scansFinaux.push(...morceau);
    }
    void empilerSync(
      "scan_records",
      scansFinaux.map((s) => ({
        local_id: s.id,
        reception_local_id: id,
        code_barre: s.codeBarre,
        quantite: s.quantite,
        pointe_at: s.createdAt.toISOString(),
        maj_at: s.updatedAt.toISOString(),
      }))
    );

    return NextResponse.json({ ...etat, pointes: total });
  } catch (error) {
    console.error("Pointage de la réception impossible :", error);
    return NextResponse.json(
      { error: "Pointage de la réception impossible (erreur serveur)." },
      { status: 500 }
    );
  }
}
