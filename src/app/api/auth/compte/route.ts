import { NextResponse } from "next/server";
import { lireConfigFichier } from "@/lib/cloud/config-fichier";
import {
  cookieConnexion,
  lireCompteRequete,
  verifierIdentifiants,
  type ComptePublic,
} from "@/lib/cloud/session";

export const dynamic = "force-dynamic";

/** Détecte si la requête arrive en HTTPS (pour le flag « secure » du cookie). */
function requeteEnHttps(req: Request): boolean {
  if (req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https") return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Vue publique d'un compte (jamais de code secret dans la réponse). */
function enPublic(c: {
  identifiant: string;
  nom: string;
  role: string;
  siteId: string;
  siteLabel: string;
}): ComptePublic {
  return {
    identifiant: c.identifiant,
    nom: c.nom,
    role: c.role as ComptePublic["role"],
    siteId: c.siteId,
    siteLabel: c.siteLabel,
  };
}

/**
 * GET /api/auth/compte — état de l'authentification :
 *  - authActive : des comptes sont définis dans cloud.config.json ;
 *  - compte     : compte connecté (ou null) ;
 *  - comptes    : liste publique des comptes (sans codes) pour l'écran de
 *    connexion (choisir son compte puis saisir son code).
 */
export async function GET() {
  try {
    const cfg = await lireConfigFichier();
    const compte = await lireCompteRequete();
    return NextResponse.json(
      {
        authActive: cfg.comptes.length > 0,
        erreurConfig: cfg.erreur,
        compte,
        comptes: cfg.comptes.map(enPublic),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Lecture du compte impossible :", error);
    return NextResponse.json({ error: "Lecture du compte impossible." }, { status: 500 });
  }
}

/**
 * POST /api/auth/compte — actions :
 *  - { action: "login", identifiant, code } → connexion (cookie signé 30 j) ;
 *  - { action: "logout" }                   → déconnexion (cookie effacé).
 */
export async function POST(req: Request) {
  let corps: { action?: string; identifiant?: unknown; code?: unknown };
  try {
    corps = (await req.json()) as typeof corps;
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  try {
    const cfg = await lireConfigFichier();
    if (cfg.comptes.length === 0) {
      return NextResponse.json(
        { error: "Aucun compte n'est configuré (fichier cloud.config.json à la racine)." },
        { status: 400 }
      );
    }

    // -------------------------------------------------------------- logout
    if (corps.action === "logout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.set("cld_compte", "", { httpOnly: true, path: "/", maxAge: 0 });
      return res;
    }

    // --------------------------------------------------------------- login
    if (corps.action === "login") {
      const identifiant = String(corps.identifiant ?? "").trim().toLowerCase();
      const code = String(corps.code ?? "");
      if (!identifiant || !code) {
        return NextResponse.json(
          { error: "Choisissez votre compte et saisissez votre code." },
          { status: 400 }
        );
      }
      const compte = await verifierIdentifiants(identifiant, code);
      if (!compte) {
        return NextResponse.json(
          { error: "Identifiant ou code incorrect." },
          { status: 401 }
        );
      }
      const cookie = await cookieConnexion(compte, requeteEnHttps(req));
      const res = NextResponse.json({ ok: true, compte });
      res.cookies.set(cookie.nom, cookie.valeur, cookie.options);
      return res;
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("Authentification impossible :", error);
    return NextResponse.json(
      { error: "Authentification impossible (erreur serveur)." },
      { status: 500 }
    );
  }
}
