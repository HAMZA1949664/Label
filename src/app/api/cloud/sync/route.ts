import { NextResponse } from "next/server";
import { viderFichierCloud } from "@/lib/cloud/queue";

export const dynamic = "force-dynamic";

/**
 * POST /api/cloud/sync — vidage manuel de la file de synchronisation vers
 * Supabase (bouton « Synchroniser maintenant »). Retourne le nombre de
 * lignes poussées et celles restant en attente (coupure réseau, clé…).
 */
export async function POST() {
  try {
    const resultat = await viderFichierCloud();
    return NextResponse.json(resultat, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Synchronisation cloud manuelle impossible :", error);
    return NextResponse.json(
      { error: "Synchronisation impossible (erreur serveur)." },
      { status: 500 }
    );
  }
}
