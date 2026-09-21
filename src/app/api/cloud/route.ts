import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  apercuCle,
  invaliderCacheCloud,
  lireEtatCloud,
  testerConnexionCloud,
  validerCleSupabase,
  validerSiteId,
  validerUrlSupabase,
} from "@/lib/cloud/supabase";
import { declencherSyncAuto, compterEnAttente } from "@/lib/cloud/queue";

export const dynamic = "force-dynamic";

interface ErreurApi {
  error: string;
}

/** Construit la réponse de statut (jamais de clé en clair). */
async function reponseStatut() {
  const etat = await lireEtatCloud(true);
  const [enAttente, synchronisees, enErreur] = await Promise.all([
    db.cloudSyncQueue.count({ where: { statut: "en_attente" } }),
    db.cloudSyncQueue.count({ where: { statut: "synchronise" } }),
    db.cloudSyncQueue.count({ where: { statut: "erreur" } }),
  ]);
  return NextResponse.json(
    {
      configure: !!etat.config,
      source: etat.source,
      url: etat.config?.url ?? null,
      cleApercu: etat.config ? apercuCle(etat.config.cle) : null,
      site: { id: etat.siteId, label: etat.siteLabel },
      dernierTest: {
        ok: etat.dernierTestOk,
        at: etat.dernierTestAt ? etat.dernierTestAt.toISOString() : null,
        erreur: etat.dernierTestErreur,
      },
      derniereSyncAt: etat.derniereSyncAt ? etat.derniereSyncAt.toISOString() : null,
      file: { enAttente, synchronisees, enErreur },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * GET /api/cloud — état de la connexion cloud (Supabase) + file de
 * synchronisation. Déclenche aussi, discrètement, une reprise de vidage si
 * des événements attendent (le navigateur interroge ce statut régulièrement :
 * c'est la boucle de reprise automatique après une coupure Internet).
 */
export async function GET() {
  try {
    const enAttente = await compterEnAttente();
    if (enAttente > 0) declencherSyncAuto();
    return await reponseStatut();
  } catch (error) {
    console.error("Lecture de l'état cloud impossible :", error);
    return NextResponse.json({ error: "Lecture de l'état cloud impossible." }, { status: 500 });
  }
}

/**
 * POST /api/cloud — actions de configuration :
 * - { action: "test", url, cle }          → test sans enregistrer ;
 * - { action: "save", url, cle, … }       → teste puis enregistre la connexion ;
 * - { action: "site", siteId, siteLabel } → change le site de travail ;
 * - { action: "disconnect" }              → déconnecte (conserve le site).
 */
export async function POST(req: Request) {
  let corps: {
    action?: string;
    url?: unknown;
    cle?: unknown;
    siteId?: unknown;
    siteLabel?: unknown;
  };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    const reponse: ErreurApi = { error: "Corps de requête JSON invalide." };
    return NextResponse.json(reponse, { status: 400 });
  }

  try {
    // ------------------------------------------------------------------ test
    if (corps.action === "test") {
      const urlOk = validerUrlSupabase(String(corps.url ?? ""));
      if ("erreur" in urlOk) return NextResponse.json({ error: urlOk.erreur }, { status: 400 });
      const cleOk = validerCleSupabase(String(corps.cle ?? ""));
      if ("erreur" in cleOk) return NextResponse.json({ error: cleOk.erreur }, { status: 400 });
      const test = await testerConnexionCloud(urlOk.url, cleOk.cle);
      if (!test.ok) return NextResponse.json({ error: test.erreur }, { status: 400 });
      return NextResponse.json({ ok: true, message: test.message });
    }

    // ------------------------------------------------------------------ save
    if (corps.action === "save") {
      const urlOk = validerUrlSupabase(String(corps.url ?? ""));
      if ("erreur" in urlOk) return NextResponse.json({ error: urlOk.erreur }, { status: 400 });
      const cleOk = validerCleSupabase(String(corps.cle ?? ""));
      if ("erreur" in cleOk) return NextResponse.json({ error: cleOk.erreur }, { status: 400 });

      const test = await testerConnexionCloud(urlOk.url, cleOk.cle);
      await db.cloudConfig.upsert({
        where: { singleton: 1 },
        create: {
          singleton: 1,
          supabaseUrl: test.ok ? urlOk.url : null,
          supabaseCle: test.ok ? cleOk.cle : null,
          dernierTestOk: test.ok,
          dernierTestAt: new Date(),
          dernierTestErreur: test.ok ? null : test.erreur.slice(0, 500),
        },
        update: {
          supabaseUrl: test.ok ? urlOk.url : null,
          supabaseCle: test.ok ? cleOk.cle : null,
          dernierTestOk: test.ok,
          dernierTestAt: new Date(),
          dernierTestErreur: test.ok ? null : test.erreur.slice(0, 500),
        },
      });
      invaliderCacheCloud();
      if (!test.ok) {
        // La configuration n'est PAS retenue : on affiche la cause exacte.
        return NextResponse.json({ error: test.erreur }, { status: 400 });
      }
      declencherSyncAuto(); // démarre la reprise de la file dès la connexion
      return NextResponse.json({ ok: true, message: test.message });
    }

    // ------------------------------------------------------------------ site
    if (corps.action === "site") {
      const idOk = validerSiteId(String(corps.siteId ?? ""));
      if ("erreur" in idOk) return NextResponse.json({ error: idOk.erreur }, { status: 400 });
      const libelle = String(corps.siteLabel ?? "").trim();
      if (libelle.length === 0 || libelle.length > 60) {
        return NextResponse.json(
          { error: "Libellé de site requis (1 à 60 caractères)." },
          { status: 400 }
        );
      }
      await db.cloudConfig.upsert({
        where: { singleton: 1 },
        create: { singleton: 1, siteId: idOk.id, siteLabel: libelle },
        update: { siteId: idOk.id, siteLabel: libelle },
      });
      invaliderCacheCloud();
      return NextResponse.json({
        ok: true,
        message: `Site de travail enregistré : ${libelle}.`,
      });
    }

    // ------------------------------------------------------------ disconnect
    if (corps.action === "disconnect") {
      await db.cloudConfig.upsert({
        where: { singleton: 1 },
        create: { singleton: 1, supabaseUrl: null, supabaseCle: null },
        update: {
          supabaseUrl: null,
          supabaseCle: null,
          dernierTestOk: null,
          dernierTestErreur: null,
        },
      });
      invaliderCacheCloud();
      return NextResponse.json({
        ok: true,
        message:
          "Connexion Supabase supprimée. Les événements restent en file d'attente locale et partiront à la prochaine connexion.",
      });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("Configuration cloud impossible :", error);
    return NextResponse.json(
      { error: "Configuration cloud impossible (erreur serveur)." },
      { status: 500 }
    );
  }
}
