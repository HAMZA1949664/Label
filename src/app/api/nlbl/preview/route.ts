import { NextResponse } from "next/server";
import { apercuNlbl, horodatageFichier } from "@/lib/nlbl/generator";
import { validerEtiquettes, validerImprimante } from "@/lib/nlbl/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/nlbl/preview
 * Corps : { labels: [{ … }], printer?: string }
 *
 * Retourne la structure exacte du fichier .NLBL qui serait généré (entrées de
 * l'archive, variables injectées, XML solution, taille, imprimante cible)
 * SANS téléchargement ni journalisation. Utilisé par la fonction
 * « Contenu du fichier » de la page générateur (vérification avant impression).
 */
export async function POST(req: Request) {
  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête JSON invalide." },
      { status: 400 }
    );
  }

  const corpsTape = (corps ?? {}) as { labels?: unknown; printer?: unknown };
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

  const { nom: imprimante, erreur } = validerImprimante(corpsTape.printer);
  if (erreur) {
    return NextResponse.json({ error: erreur }, { status: 400 });
  }

  if (etiquettes.length !== 1) {
    return NextResponse.json(
      {
        error:
          "L'aperçu concerne une seule étiquette : complétez le formulaire avant de l'afficher.",
      },
      { status: 400 }
    );
  }

  try {
    const apercu = apercuNlbl(
      etiquettes[0],
      `etiquettes_${horodatageFichier()}`,
      imprimante ? { imprimante } : {}
    );
    return NextResponse.json(apercu, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Erreur aperçu .nlbl :", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Échec de l'aperçu du fichier .NLBL : ${error.message}`
            : "Échec de l'aperçu du fichier .NLBL (erreur inconnue).",
      },
      { status: 500 }
    );
  }
}
