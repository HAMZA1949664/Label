import { NextResponse } from "next/server";
import { debutJourParis } from "@/lib/periode-paris";
import { lireEtatCloud, selectionnerCloud } from "@/lib/cloud/supabase";

export const dynamic = "force-dynamic";

/** Périodes proposées pour le journal multi-sites. */
const PERIODES = new Set(["7j", "courante", "precedente", "tout"]);

/** Jour calendaire courant en Europe/Paris (« AAAA-MM-JJ »). */
function jourParis(date = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Lundi de la semaine (parisienne) contenant le jour donné. */
function lundiDe(jour: string): string {
  const [y, m, d] = jour.split("-").map(Number);
  const repere = new Date(Date.UTC(y, m - 1, d, 12)); // midi = à l'abri des DST
  const jourSemaine = repere.getUTCDay(); // 0 = dimanche
  const decalage = jourSemaine === 0 ? 6 : jourSemaine - 1;
  repere.setUTCDate(repere.getUTCDate() - decalage);
  return repere.toISOString().slice(0, 10);
}

interface Bornes {
  debut: string | null;
  fin: string | null;
  libelle: string;
}

/** Résout les bornes ISO de la période demandée (Europe/Paris). */
function bornesPeriode(mode: string): Bornes {
  if (mode === "tout") return { debut: null, fin: null, libelle: "Tout l'historique" };

  if (mode === "precedente") {
    const lundiPrecedent = lundiDe(lundiDe(jourParis()));
    const debut = debutJourParis(lundiPrecedent);
    if (debut) {
      const fin = new Date(debut.getTime() + 7 * 24 * 60 * 60 * 1_000);
      return { debut: debut.toISOString(), fin: fin.toISOString(), libelle: "Semaine précédente (lun → dim)" };
    }
    return { debut: null, fin: null, libelle: "Semaine précédente" };
  }

  if (mode === "courante") {
    const debut = debutJourParis(lundiDe(jourParis()));
    if (debut) {
      return { debut: debut.toISOString(), fin: null, libelle: "Semaine en cours (depuis lundi)" };
    }
    return { debut: null, fin: null, libelle: "Semaine en cours" };
  }

  // 7 jours glissants (défaut)
  return {
    debut: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
    fin: null,
    libelle: "7 derniers jours",
  };
}

/** Étiquette cloud (vue aplatie pour l'interface). */
interface EtiquetteCloud {
  siteId: string;
  siteLabel: string;
  modele: string;
  couleur: string;
  taille: string;
  of: string;
  quantite: number;
  source: string;
  genereAt: string;
}

/** Impression cloud (vue aplatie pour l'interface). */
interface ImpressionCloud {
  siteId: string;
  siteLabel: string;
  kind: string;
  filename: string;
  labelsCount: number;
  eventAt: string;
}

/** Regroupe des lignes (étiquettes / impressions) par site. */
function agregerParSite(
  lignes: Array<{ site_id: string; site_label: string; quantite?: number }>,
  impressions: Array<{ site_id: string; site_label: string }>
) {
  const sites = new Map<string, { siteId: string; siteLabel: string; etiquettes: number; pieces: number; impressions: number }>();
  for (const l of lignes) {
    const s = sites.get(l.site_id) ?? { siteId: l.site_id, siteLabel: l.site_label || l.site_id, etiquettes: 0, pieces: 0, impressions: 0 };
    s.etiquettes += 1;
    s.pieces += typeof l.quantite === "number" ? l.quantite : 1;
    sites.set(l.site_id, s);
  }
  for (const i of impressions) {
    const s = sites.get(i.site_id) ?? { siteId: i.site_id, siteLabel: i.site_label || i.site_id, etiquettes: 0, pieces: 0, impressions: 0 };
    s.impressions += 1;
    sites.set(i.site_id, s);
  }
  return [...sites.values()].sort((a, b) => b.etiquettes - a.etiquettes);
}

/**
 * GET /api/cloud/journal — activité de TOUS les sites depuis la base
 * Supabase partagée (lecture croisée France ↔ façonniers) :
 * ?site=tous|<siteId>&periode=7j|courante|precedente|tout
 *
 * C'est le socle du flux W-1 : le façonnier imprime la semaine N en Tunisie,
 * Clément Design consulte ici ce qui a été produit puis prépare la
 * réception de la semaine N+1.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const site = (url.searchParams.get("site") || "tous").slice(0, 60);
    const mode = url.searchParams.get("periode") || "7j";
    const periodeOk = PERIODES.has(mode) ? mode : "7j";

    const etat = await lireEtatCloud();
    if (!etat.config) {
      return NextResponse.json(
        {
          error:
            "Base cloud non connectée : configurez Supabase (bouton Cloud → Connexion) pour consulter l'activité des sites.",
          code: "non_configure",
        },
        { status: 400 }
      );
    }

    const bornes = bornesPeriode(periodeOk);
    const filtres: string[] = [];
    if (site !== "tous") filtres.push(`site_id=eq.${site}`);
    if (bornes.debut) filtres.push(`genere_at=gte.${bornes.debut}`);
    if (bornes.fin) filtres.push(`genere_at=lt.${bornes.fin}`);
    const filtresImpression = filtres.map((f) =>
      f.startsWith("genere_at=") ? f.replace("genere_at=", "event_at=") : f
    );

    const [lignesBrutes, impressionsBrutes, agrEtiquettes, agrImpressions] = await Promise.all([
      selectionnerCloud(
        "label_generations",
        {
          colonnes: "site_id,site_label,modele,couleur,taille,of,quantite,source,genere_at",
          filtres,
          ordre: "genere_at.desc",
          limite: 100,
        },
        etat.config
      ),
      selectionnerCloud(
        "print_events",
        {
          colonnes: "site_id,site_label,kind,filename,labels_count,event_at",
          filtres: filtresImpression,
          ordre: "event_at.desc",
          limite: 30,
        },
        etat.config
      ),
      selectionnerCloud(
        "label_generations",
        { colonnes: "site_id,site_label,quantite", filtres, limite: 5_000 },
        etat.config
      ),
      selectionnerCloud(
        "print_events",
        { colonnes: "site_id,site_label", filtres: filtresImpression, limite: 2_000 },
        etat.config
      ),
    ]);

    const etiquettes: EtiquetteCloud[] = lignesBrutes.map((l) => ({
      siteId: String(l.site_id ?? ""),
      siteLabel: String(l.site_label ?? ""),
      modele: String(l.modele ?? ""),
      couleur: String(l.couleur ?? ""),
      taille: String(l.taille ?? ""),
      of: String(l.of ?? ""),
      quantite: typeof l.quantite === "number" ? l.quantite : 1,
      source: String(l.source ?? ""),
      genereAt: String(l.genere_at ?? ""),
    }));
    const impressions: ImpressionCloud[] = impressionsBrutes.map((l) => ({
      siteId: String(l.site_id ?? ""),
      siteLabel: String(l.site_label ?? ""),
      kind: String(l.kind ?? ""),
      filename: String(l.filename ?? ""),
      labelsCount: typeof l.labels_count === "number" ? l.labels_count : 0,
      eventAt: String(l.event_at ?? ""),
    }));

    const parSite = agregerParSite(agrEtiquettes, agrImpressions);
    const pieces = parSite.reduce((somme, s) => somme + s.pieces, 0);
    const impressionsTotal = parSite.reduce((somme, s) => somme + s.impressions, 0);

    return NextResponse.json(
      {
        periode: { id: periodeOk, ...bornes },
        site: site === "tous" ? null : site,
        totaux: {
          etiquettes: agrEtiquettes.length,
          pieces,
          impressions: impressionsTotal,
          sitesActifs: parSite.length,
        },
        parSite,
        etiquettes,
        impressions,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Lecture du journal cloud impossible :", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Lecture du journal cloud impossible : ${error.message}`
            : "Lecture du journal cloud impossible.",
      },
      { status: 502 }
    );
  }
}
