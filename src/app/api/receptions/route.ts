import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { debutJourParis } from "@/lib/periode-paris";
import { resumerReceptions } from "@/lib/receptions-server";
import { empilerSync } from "@/lib/cloud/queue";
import { exigerRoleFrance } from "@/lib/cloud/session";
import {
  MAX_LIGNES_RECEPTION,
  type CorpsCreationReception,
  type SourceReception,
} from "@/lib/receptions";

export const dynamic = "force-dynamic";

interface ErreurApi {
  error: string;
}

/** Limites de saisie. */
const LIMITE_TITRE = 120;
const LIMITE_NOTE = 500;
const MAX_OFS_SOURCE = 50;

/** Valide la source et retourne la clause Prisma sur LabelRecord. */
async function clauseSource(
  source: SourceReception
): Promise<{ where?: Record<string, unknown>; erreur?: string }> {
  if (source.mode === "of") {
    if (
      !Array.isArray(source.ofs) ||
      source.ofs.length === 0 ||
      source.ofs.length > MAX_OFS_SOURCE
    ) {
      return {
        erreur: `Fournissez entre 1 et ${MAX_OFS_SOURCE} numéros d'OF.`,
      };
    }
    const ofs: string[] = [];
    for (const o of source.ofs) {
      if (typeof o !== "string" || !/^\d{1,20}$/.test(o.trim())) {
        return { erreur: `Numéro d'OF invalide : « ${String(o).slice(0, 20)} ».` };
      }
      ofs.push(o.trim());
    }
    return { where: { of: { in: [...new Set(ofs)] } } };
  }

  if (source.mode === "periode") {
    const debut = debutJourParis(source.du ?? "");
    const fin = debutJourParis(source.au ?? "");
    if (!debut || !fin) {
      return {
        erreur: "Dates invalides (format attendu : AAAA-MM-JJ, fuseau Paris).",
      };
    }
    fin.setUTCDate(fin.getUTCDate() + 1); // exclusive : journée complète
    if (debut >= fin) {
      return { erreur: "La date de début doit précéder la date de fin." };
    }
    return { where: { createdAt: { gte: debut, lt: fin } } };
  }

  if (source.mode === "tout") return {};
  return { erreur: "Source de création inconnue." };
}

/**
 * GET /api/receptions — liste des réceptions prévues avec résumés
 * (attendu / reçu / taux) pour le sélecteur de l'espace colisage.
 */
export async function GET() {
  try {
    // Auth active : la réception/colisage est réservée au compte France.
    const garde = await exigerRoleFrance();
    if (garde) return NextResponse.json({ error: garde }, { status: 403 });
    const resumes = await resumerReceptions();
    return NextResponse.json(
      { receptions: resumes },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Lecture des réceptions impossible :", error);
    return NextResponse.json(
      { error: "Lecture des réceptions impossible (erreur serveur)." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/receptions — crée une réception prévue depuis les étiquettes
 * générées (par OF, par période ou l'ensemble), regroupées en lignes
 * OF → modèle → couleur → taille avec quantités attendues.
 */
export async function POST(req: Request) {
  // Auth active : la création de réceptions est réservée au compte France.
  const garde = await exigerRoleFrance();
  if (garde) return NextResponse.json({ error: garde }, { status: 403 });

  let corps: CorpsCreationReception;
  try {
    corps = (await req.json()) as CorpsCreationReception;
  } catch {
    const reponse: ErreurApi = { error: "Corps de requête JSON invalide." };
    return NextResponse.json(reponse, { status: 400 });
  }

  const titre = (corps.titre ?? "").trim();
  if (titre.length === 0 || titre.length > LIMITE_TITRE) {
    return NextResponse.json(
      { error: `Titre requis (1 à ${LIMITE_TITRE} caractères).` },
      { status: 400 }
    );
  }
  const note = (corps.note ?? "").trim();
  if (note.length > LIMITE_NOTE) {
    return NextResponse.json(
      { error: `Note trop longue (max ${LIMITE_NOTE} caractères).` },
      { status: 400 }
    );
  }
  if (!corps.source || typeof corps.source !== "object") {
    return NextResponse.json(
      { error: "Source de création manquante." },
      { status: 400 }
    );
  }

  const { where, erreur } = await clauseSource(corps.source);
  if (erreur) {
    return NextResponse.json({ error: erreur }, { status: 400 });
  }

  try {
    const etiquettes = await db.labelRecord.findMany({
      ...(where ? { where } : {}),
      select: {
        modele: true,
        couleur: true,
        couleurCode: true,
        taille: true,
        manche: true,
        of: true,
        quantite: true,
      },
    });
    if (etiquettes.length === 0) {
      return NextResponse.json(
        {
          error:
            "Aucune étiquette générée ne correspond à cette source. Générez d'abord des étiquettes (ou vérifiez les OF / la période).",
        },
        { status: 422 }
      );
    }

    // Regroupement OF → modèle → couleur → taille (+ manche), somme des copies.
    interface Agregat {
      of: string;
      modele: string;
      couleur: string;
      couleurCode: string;
      taille: string;
      manche: string;
      attendu: number;
    }
    const agregats = new Map<string, Agregat>();
    for (const e of etiquettes) {
      const cle = `${e.of}|${e.modele}|${e.couleur}|${e.taille}|${e.manche}`;
      const existant = agregats.get(cle);
      if (existant) existant.attendu += e.quantite;
      else
        agregats.set(cle, {
          of: e.of,
          modele: e.modele,
          couleur: e.couleur,
          couleurCode: e.couleurCode,
          taille: e.taille,
          manche: e.manche,
          attendu: e.quantite,
        });
    }

    if (agregats.size > MAX_LIGNES_RECEPTION) {
      return NextResponse.json(
        {
          error: `Trop de lignes attendues (${agregats.size}). Maximum : ${MAX_LIGNES_RECEPTION.toLocaleString("fr-FR")} — réduisez la période ou le nombre d'OF.`,
        },
        { status: 422 }
      );
    }

    // Champs de secours (étiquettes non résolues dans le catalogue).
    // Identifiants explicites : repris comme local_id cloud (idempotence).
    const lignes = [...agregats.values()].map((a) => ({
      ...a,
      id: crypto.randomUUID(),
      couleur: a.couleur || "Non résolue",
      taille: a.taille || "?",
      manche: a.manche || "",
      couleurCode: a.couleurCode || "",
    }));

    const creee = await db.reception.create({
      data: {
        titre,
        note: note || null,
        lignes: { create: lignes },
      },
      select: { id: true },
    });

    // Miroir cloud : la réception prévue est partagée dans la base Supabase
    // (France ↔ façonniers) — file d'attente non bloquante, reprise auto.
    const creeAt = new Date().toISOString();
    void empilerSync("receptions", [
      { local_id: creee.id, titre, statut: "ouverte", note: note || null, cree_at: creeAt },
    ]);
    void empilerSync(
      "reception_lines",
      lignes.map((l) => ({
        local_id: l.id,
        reception_local_id: creee.id,
        of: l.of,
        modele: l.modele,
        couleur: l.couleur,
        couleur_code: l.couleurCode,
        taille: l.taille,
        manche: l.manche,
        attendu: l.attendu,
      }))
    );

    return NextResponse.json(
      { id: creee.id, lignes: lignes.length },
      { status: 201 }
    );
  } catch (error) {
    console.error("Création de réception impossible :", error);
    return NextResponse.json(
      { error: "Création de la réception impossible (erreur serveur)." },
      { status: 500 }
    );
  }
}
