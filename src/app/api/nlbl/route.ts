import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validerEtiquettes, validerImprimante } from "@/lib/nlbl/validation";
import { genererPaquetNlbl } from "@/lib/nlbl/generator";
import { enregistrerEtiquettesGenerees } from "@/lib/label-records";
import { empilerSync } from "@/lib/cloud/queue";

export const dynamic = "force-dynamic";

interface ErreurApi {
  error: string;
  details?: unknown;
}

/**
 * POST /api/nlbl
 * Corps : { labels: [{ … }], printer?: string, quantites?: number[] }
 * Réponse : fichier binaire .nlbl (1 étiquette) ou .zip (lot d'étiquettes).
 * Les données sont intégrées directement dans le .nlbl : aucune importation
 * manuelle n'est requise dans Zebra Designer Essentials.
 * Optionnel : printer = nom d'imprimante cible intégré au fichier (réglages
 * d'impression uniquement — le design du modèle n'est jamais modifié).
 * Optionnel : quantites = copies à imprimer par étiquette (1-99, documentées
 * dans le LISEZMOI du .zip ; le nombre de fichiers reste inchangé).
 */
export async function POST(req: Request) {
  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    const reponse: ErreurApi = { error: "Corps de requête JSON invalide." };
    return NextResponse.json(reponse, { status: 400 });
  }

  // 1. Validation complète des données (obligatoire, longueurs, EAN-13, XML)
  const corpsTape = (corps ?? {}) as {
    labels?: unknown;
    printer?: unknown;
    quantites?: unknown;
  };
  const { etiquettes, erreurs } = validerEtiquettes(corpsTape.labels);
  if (erreurs.length > 0) {
    return NextResponse.json(
      {
        error:
          erreurs.length === 1
            ? erreurs[0].message
            : `${erreurs.length} erreurs de validation détectées.`,
        details: erreurs,
      },
      { status: 400 }
    );
  }

  // 1 bis. Préférences d'imprimante optionnelles (nom exact Windows)
  const { nom: imprimante, erreur } = validerImprimante(corpsTape.printer);
  if (erreur) {
    return NextResponse.json({ error: erreur }, { status: 400 });
  }

  // 1 ter. Quantités de copies optionnelles (une par étiquette, 1-99)
  let quantites: number[] | undefined;
  if (Array.isArray(corpsTape.quantites) && corpsTape.quantites.length > 0) {
    if (corpsTape.quantites.length !== etiquettes.length) {
      return NextResponse.json(
        {
          error: `Le nombre de quantités (${corpsTape.quantites.length}) ne correspond pas au nombre d'étiquettes (${etiquettes.length}).`,
        },
        { status: 400 }
      );
    }
    if (corpsTape.quantites.some((q) => !Number.isInteger(q) || q < 1 || q > 99)) {
      return NextResponse.json(
        { error: "Chaque quantité doit être un nombre entier entre 1 et 99." },
        { status: 400 }
      );
    }
    quantites = corpsTape.quantites as number[];
  }

  // 2. Génération du paquet .nlbl / .zip
  try {
    const paquet = genererPaquetNlbl(etiquettes, new Date(), {
      ...(imprimante ? { imprimante } : {}),
      ...(quantites ? { quantites } : {}),
    });

    // 3. Journalisation en base (n'empêche pas le téléchargement en cas d'échec)
    let journalId: string | null = null;
    try {
      const item = await db.generationLog.create({
        data: {
          kind: "NLBL",
          filename: paquet.filename,
          labelsCount: paquet.copiesTotales,
          details: JSON.stringify({
            mode: paquet.mode,
            imprimante: imprimante ?? null,
            // Les 7 variables sont journalisées pour permettre la régénération
            // d'un lot depuis le journal (remise dans la file d'impression).
            etiquettes: etiquettes.map((e) => ({
              modele: e.modele,
              type: e.type,
              of: e.of,
              taille: e.taille,
              couleur: e.couleur,
              manche: e.manche,
              codeBarre: e.codeBarre,
            })),
          }).slice(0, 6000),
        },
      });
      journalId = item.id;
    } catch (logError) {
      console.error("Journalisation NLBL impossible :", logError);
    }

    // 3 bis. Mémoire permanente des étiquettes générées (codes FAB / SPE,
    // OF, modèle…) : alimente le décodage colisage et les réceptions prévues.
    // N'interrompt jamais le téléchargement en cas d'échec (erreurs loggées).
    await enregistrerEtiquettesGenerees(etiquettes, paquet.filename, quantites);

    // 3 ter. Miroir cloud : l'impression du lot est enregistrée dans la base
    // Supabase partagée (France ↔ façonniers) — file d'attente non bloquante.
    void empilerSync("print_events", [
      {
        local_id: journalId ?? crypto.randomUUID(),
        kind: "NLBL",
        filename: paquet.filename,
        labels_count: paquet.copiesTotales,
        details: JSON.stringify({ mode: paquet.mode, imprimante: imprimante ?? null }).slice(0, 3000),
        event_at: new Date().toISOString(),
      },
    ]);

    return new Response(new Uint8Array(paquet.data), {
      status: 200,
      headers: {
        "Content-Type": paquet.mime,
        "Content-Disposition": `attachment; filename="${paquet.filename}"`,
        "Cache-Control": "no-store",
        "X-Label-Count": String(paquet.labelCount),
        "X-Label-Copies": String(paquet.copiesTotales),
        "X-Label-Mode": paquet.mode,
      },
    });
  } catch (error) {
    console.error("Erreur génération .nlbl :", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Échec de la génération du fichier .NLBL : ${error.message}`
            : "Échec de la génération du fichier .NLBL (erreur inconnue).",
      },
      { status: 500 }
    );
  }
}
