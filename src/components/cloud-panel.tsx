"use client";

/**
 * Panneau « Cloud » — connexion Supabase multi-sites (Clément Design).
 *
 * Un seul bouton dans l'en-tête ouvre ce panneau autonome :
 *  - onglet Connexion : site de travail (France / façonniers Tunisie) + URL et
 *    clé service_role du projet Supabase, test, synchronisation manuelle ;
 *  - onglet Journal des sites : activité de TOUS les sites lue dans la base
 *    partagée (socle du flux W-1 : impression semaine N → réception N+1) ;
 *  - onglet Guide : mise en route Supabase en 5 étapes avec copie du script.
 *
 * Le composant gère son propre état (poll 30 s du statut) : il ne touche à
 * rien d'autre dans la page — zéro régression sur les flux existants.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  Building2,
  CheckCircle2,
  CloudOff,
  CloudUpload,
  Copy,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  Factory,
  FileText,
  Loader2,
  Lock,
  Printer,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCompte } from "@/components/compte-garde";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types (miroir des réponses /api/cloud)
// ---------------------------------------------------------------------------

interface StatutCloud {
  configure: boolean;
  /** fichier = cloud.config.json ; base = interface ; env = variables d'environnement. */
  source: "fichier" | "base" | "env" | "aucune";
  url: string | null;
  cleApercu: string | null;
  site: { id: string; label: string };
  dernierTest: { ok: boolean | null; at: string | null; erreur: string | null };
  derniereSyncAt: string | null;
  file: { enAttente: number; synchronisees: number; enErreur: number };
}

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

interface ImpressionCloud {
  siteId: string;
  siteLabel: string;
  kind: string;
  filename: string;
  labelsCount: number;
  eventAt: string;
}

interface JournalCloud {
  periode: { id: string; libelle: string; debut: string | null; fin: string | null };
  totaux: { etiquettes: number; pieces: number; impressions: number; sitesActifs: number };
  parSite: Array<{ siteId: string; siteLabel: string; etiquettes: number; pieces: number; impressions: number }>;
  etiquettes: EtiquetteCloud[];
  impressions: ImpressionCloud[];
}

/** Sites prédéfinis (l'identifiant technique est libre via « Autre site… »). */
const SITES_PREDEFINIS = [
  { id: "france-hq", label: "France — Clément Design" },
  { id: "tn-fac1", label: "Tunisie — Façonnier 1" },
  { id: "tn-fac2", label: "Tunisie — Façonnier 2" },
] as const;

const PERIODES_JOURNAL = [
  { id: "7j", label: "7 derniers jours" },
  { id: "courante", label: "Semaine en cours" },
  { id: "precedente", label: "Semaine précédente" },
  { id: "tout", label: "Tout l'historique" },
] as const;

// ---------------------------------------------------------------------------
// Helpers d'affichage
// ---------------------------------------------------------------------------

/** « il y a 3 min » … */
function relatif(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} j`;
}

/** Date + heure locale (fr-FR). */
function horodatage(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Couleur du point d'état du bouton d'en-tête. */
function couleurPoint(statut: StatutCloud | null): string {
  if (!statut || !statut.configure) return "bg-amber-400";
  if (statut.dernierTest.ok === false) return "bg-red-400";
  return "bg-emerald-400";
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function CloudPanel() {
  const { toast } = useToast();
  const { authActive, compte } = useCompte();
  const [statut, setStatut] = useState<StatutCloud | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [onglet, setOnglet] = useState("connexion");

  // Formulaire de connexion
  const [url, setUrl] = useState("");
  const [cle, setCle] = useState("");
  const [voirCle, setVoirCle] = useState(false);
  const [testEnCours, setTestEnCours] = useState(false);
  const [saveEnCours, setSaveEnCours] = useState(false);
  const [syncEnCours, setSyncEnCours] = useState(false);

  // Site de travail
  const [siteChoisi, setSiteChoisi] = useState<string>("france-hq");
  const [siteIdPerso, setSiteIdPerso] = useState("");
  const [siteLabelPerso, setSiteLabelPerso] = useState("");
  const [siteEnCours, setSiteEnCours] = useState(false);

  // Journal des sites
  const [journal, setJournal] = useState<JournalCloud | null>(null);
  const [journalChargement, setJournalChargement] = useState(false);
  const [filtreSite, setFiltreSite] = useState("tous");
  const [filtrePeriode, setFiltrePeriode] = useState("7j");
  const [copieSql, setCopieSql] = useState(false);

  /** Statut (silencieux pour le poll, verbeux à l'ouverture). */
  const chargerStatut = useCallback(async (silencieux: boolean) => {
    try {
      const res = await fetch("/api/cloud", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as StatutCloud;
      setStatut(data);
      if (!silencieux) {
        setSiteChoisi(
          SITES_PREDEFINIS.some((s) => s.id === data.site.id) ? data.site.id : "autre"
        );
        setSiteIdPerso(SITES_PREDEFINIS.some((s) => s.id === data.site.id) ? "" : data.site.id);
        setSiteLabelPerso(SITES_PREDEFINIS.some((s) => s.id === data.site.id) ? "" : data.site.label);
        setUrl(data.url ?? "");
      }
    } catch {
      if (!silencieux)
        toast({
          variant: "destructive",
          title: "Impossible de lire l'état de la connexion cloud.",
        });
    }
  }, []);

  /** Journal multi-sites (lire la base partagée). */
  const chargerJournal = useCallback(async () => {
    setJournalChargement(true);
    try {
      const res = await fetch(
        `/api/cloud/journal?site=${encodeURIComponent(filtreSite)}&periode=${encodeURIComponent(filtrePeriode)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        setJournal(null);
        if ((data as { code?: string }).code !== "non_configure") {
          toast({
            variant: "destructive",
            title:
              (data as { error?: string }).error ?? "Lecture du journal impossible.",
          });
        }
        return;
      }
      setJournal(data as JournalCloud);
    } catch {
      setJournal(null);
      toast({
        variant: "destructive",
        title: "Lecture du journal cloud impossible (réseau).",
      });
    } finally {
      setJournalChargement(false);
    }
  }, [filtreSite, filtrePeriode]);

  // Poll du statut (boucle de reprise : le GET relance aussi le vidage file)
  useEffect(() => {
    void chargerStatut(true);
    const id = setInterval(() => void chargerStatut(true), 30_000);
    return () => clearInterval(id);
  }, [chargerStatut]);

  // À l'ouverture du dialog : statut détaillé + éventuellement journal
  useEffect(() => {
    if (ouvert) void chargerStatut(false);
  }, [ouvert, chargerStatut]);

  useEffect(() => {
    if (ouvert && onglet === "journal") void chargerJournal();
  }, [ouvert, onglet, chargerJournal]);

  /** Test de connexion sans enregistrer. */
  async function testerConnexion() {
    setTestEnCours(true);
    try {
      const res = await fetch("/api/cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", url, cle }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: data.error ?? "Test échoué." });
        return;
      }
      toast({ title: data.message ?? "Connexion réussie." });
    } catch {
      toast({ variant: "destructive", title: "Test impossible (réseau)." });
    } finally {
      setTestEnCours(false);
    }
  }

  /** Enregistre la connexion (testée au préalable côté serveur). */
  async function enregistrerConnexion() {
    setSaveEnCours(true);
    try {
      const res = await fetch("/api/cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", url, cle }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: data.error ?? "Enregistrement refusé." });
        await chargerStatut(true);
        return;
      }
      toast({
        title: data.message ?? "Connexion enregistrée.",
        description:
          "Les événements en attente partent automatiquement vers Supabase.",
      });
      setCle("");
      await chargerStatut(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Enregistrement impossible (réseau).",
      });
    } finally {
      setSaveEnCours(false);
    }
  }

  /** Change le site de travail. */
  async function enregistrerSite(id: string, label: string) {
    setSiteEnCours(true);
    try {
      const res = await fetch("/api/cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "site", siteId: id, siteLabel: label }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: data.error ?? "Site non enregistré." });
        return;
      }
      toast({ title: data.message ?? "Site enregistré." });
      await chargerStatut(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Enregistrement du site impossible (réseau).",
      });
    } finally {
      setSiteEnCours(false);
    }
  }

  /** Déconnecte Supabase (la file locale est conservée). */
  async function deconnecter() {
    try {
      const res = await fetch("/api/cloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: data.error ?? "Déconnexion impossible." });
        return;
      }
      toast({ title: data.message ?? "Connexion supprimée." });
      setUrl("");
      setCle("");
      await chargerStatut(true);
    } catch {
      toast({ variant: "destructive", title: "Déconnexion impossible (réseau)." });
    }
  }

  /** Vidage manuel de la file. */
  async function synchroniser() {
    setSyncEnCours(true);
    try {
      const res = await fetch("/api/cloud/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: data.error ?? "Synchronisation impossible.",
        });
        return;
      }
      if (data.nonConfigure) {
        toast({
          title: "Cloud non configuré — les événements restent en file d'attente locale.",
        });
      } else if (data.erreur) {
        toast({
          variant: "destructive",
          title: `${data.poussees} événement(s) envoyé(s), ${data.restantes} en attente.`,
          description: data.erreur,
        });
      } else if (data.poussees === 0 && data.restantes === 0) {
        toast({ title: "Tout est à jour — rien à synchroniser." });
      } else {
        toast({ title: `${data.poussees} événement(s) envoyé(s) vers Supabase.` });
      }
      await chargerStatut(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Synchronisation impossible (réseau).",
      });
    } finally {
      setSyncEnCours(false);
    }
  }

  /** Copie le script SQL (fallback : ouverture dans un onglet). */
  async function copierScriptSql() {
    try {
      const res = await fetch("/supabase-schema.sql");
      const texte = await res.text();
      await navigator.clipboard.writeText(texte);
      setCopieSql(true);
      toast({
        title: "Script SQL copié — collez-le dans le SQL Editor de Supabase.",
      });
      setTimeout(() => setCopieSql(false), 2_500);
    } catch {
      window.open("/supabase-schema.sql", "_blank");
      toast({
        title: "Copie impossible : le script s'ouvre dans un onglet (Ctrl+A puis copier).",
      });
    }
  }

  const configure = statut?.configure ?? false;
  const enAttente = statut?.file.enAttente ?? 0;

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Base de données cloud (Supabase)"
              className="relative h-9 w-9 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              <CloudUpload className="h-4 w-4" aria-hidden="true" />
              <span
                className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-zinc-900 dark:ring-zinc-950 ${couleurPoint(statut)}`}
                aria-hidden="true"
              />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {configure
              ? `Cloud connecté (${statut?.site.label}) — ${enAttente} événement(s) en attente`
              : "Base de données cloud (Supabase) — non configurée"}
          </p>
        </TooltipContent>
      </Tooltip>

      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CloudUpload className="h-4 w-4 text-amber-600" aria-hidden="true" />
            Base de données cloud — Supabase
          </DialogTitle>
          <DialogDescription>
            Toutes les étiquettes, impressions et scans convergent dans une base
            partagée : la France et les 2 façonniers tunisiens voient la même
            production en temps réel.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={onglet} onValueChange={setOnglet}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="connexion">Connexion</TabsTrigger>
            <TabsTrigger value="journal">Journal des sites</TabsTrigger>
            <TabsTrigger value="guide">Guide</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------- Connexion */}
          <TabsContent value="connexion" className="mt-4 space-y-4">
            {/* Site de travail */}
            <section
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              aria-label="Site de travail"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Site de travail</h3>
                <Badge variant="outline" className="ml-auto font-normal text-zinc-500">
                  étiquette chaque événement
                </Badge>
              </div>
              {authActive && compte ? (
                /* Comptes actifs : le site est lié au compte connecté (cloud.config.json). */
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/50 bg-amber-50 px-3 py-2.5 dark:bg-amber-950/40">
                  {compte.role === "france" ? (
                    <Building2 className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  ) : (
                    <Factory className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">{compte.siteLabel}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Site lié au compte « {compte.nom} » — défini par Clément Design dans
                      cloud.config.json. Rien à sélectionner ici.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Qui utilise cette installation ? Chaque site marque ses étiquettes
                    et impressions de son nom dans la base partagée.
                  </p>
                  <Select
                    value={siteChoisi}
                    onValueChange={(v) => {
                      setSiteChoisi(v);
                      const predefini = SITES_PREDEFINIS.find((s) => s.id === v);
                      if (predefini && statut?.site.id !== predefini.id) {
                        void enregistrerSite(predefini.id, predefini.label);
                      }
                    }}
                  >
                    <SelectTrigger aria-label="Choisir le site de travail">
                      <SelectValue placeholder="Choisir un site" />
                    </SelectTrigger>
                    <SelectContent>
                      {SITES_PREDEFINIS.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="autre">Autre site…</SelectItem>
                    </SelectContent>
                  </Select>
                  {siteChoisi === "autre" && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label htmlFor="cloud-site-id" className="text-xs">
                          Identifiant (a-z, 0-9, tirets)
                        </Label>
                        <Input
                          id="cloud-site-id"
                          value={siteIdPerso}
                          onChange={(e) => setSiteIdPerso(e.target.value.toLowerCase())}
                          placeholder="tn-fac3"
                          className="h-9"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="cloud-site-label" className="text-xs">
                          Libellé affiché
                        </Label>
                        <Input
                          id="cloud-site-label"
                          value={siteLabelPerso}
                          onChange={(e) => setSiteLabelPerso(e.target.value)}
                          placeholder="Tunisie — Façonnier 3"
                          className="h-9"
                        />
                      </div>
                      <Button
                        size="sm"
                        className="sm:col-span-2"
                        disabled={siteEnCours || !siteIdPerso.trim() || !siteLabelPerso.trim()}
                        onClick={() => void enregistrerSite(siteIdPerso.trim(), siteLabelPerso.trim())}
                      >
                        {siteEnCours ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        )}
                        Enregistrer ce site
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Connexion Supabase */}
            <section
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              aria-label="Connexion Supabase"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Database className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Connexion au projet Supabase</h3>
                {configure ? (
                  <Badge className="ml-auto bg-emerald-600 text-white hover:bg-emerald-600">
                    Connecté
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="ml-auto border-amber-500 text-amber-600 dark:text-amber-400"
                  >
                    Non configuré
                  </Badge>
                )}
              </div>

              {statut?.cleApercu && (
                <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Connexion actuelle :{" "}
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{statut.url}</span>{" "}
                  · clé {statut.cleApercu}
                </p>
              )}

              {statut?.source === "fichier" ? (
                /* Mode fichier : connexion définie par cloud.config.json — rien à saisir. */
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/40 dark:bg-emerald-950/40">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Connexion définie par le fichier cloud.config.json
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-emerald-800/90 dark:text-emerald-300/90">
                    Cette installation est déjà connectée : l&apos;URL et la clé sont
                    enregistrées dans le fichier de configuration du serveur, géré par
                    Clément Design. Les façonniers n&apos;ont rien à saisir ni à modifier —
                    pour changer de base ou de clé, Clément édite simplement le fichier
                    cloud.config.json à la racine du projet.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cloud-url" className="text-xs">
                      URL du projet (Project Settings → API → Project URL)
                    </Label>
                    <Input
                      id="cloud-url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://xxxxxxxx.supabase.co"
                      className="h-9"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cloud-cle" className="text-xs">
                      Clé API (Project Settings → API : sb_publishable_… ou service_role)
                    </Label>
                    <div className="relative">
                      <Input
                        id="cloud-cle"
                        type={voirCle ? "text" : "password"}
                        value={cle}
                        onChange={(e) => setCle(e.target.value)}
                        placeholder={statut?.cleApercu ?? "sb_publishable_… ou sb_secret_…"}
                        className="h-9 pr-10"
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        onClick={() => setVoirCle((v) => !v)}
                        aria-label={voirCle ? "Masquer la clé" : "Afficher la clé"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        {voirCle ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={testEnCours || !url.trim() || !cle.trim()}
                      onClick={() => void testerConnexion()}
                    >
                      {testEnCours ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Tester la connexion
                    </Button>
                    <Button
                      size="sm"
                      className="bg-amber-600 text-white hover:bg-amber-700"
                      disabled={saveEnCours || !url.trim() || !cle.trim()}
                      onClick={() => void enregistrerConnexion()}
                    >
                      {saveEnCours ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : null}
                      Enregistrer et connecter
                    </Button>
                    {configure && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                        onClick={() => void deconnecter()}
                      >
                        Déconnecter
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Synchronisation */}
            <section
              className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
              aria-label="Synchronisation"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <RefreshCw className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <h3 className="text-sm font-semibold">Synchronisation</h3>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
                  <dt className="text-xs text-zinc-500">En attente</dt>
                  <dd className="text-lg font-bold leading-tight">{enAttente}</dd>
                </div>
                <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
                  <dt className="text-xs text-zinc-500">Synchronisées</dt>
                  <dd className="text-lg font-bold leading-tight">
                    {statut?.file.synchronisees.toLocaleString("fr-FR") ?? 0}
                  </dd>
                </div>
                <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
                  <dt className="text-xs text-zinc-500">Dernier envoi</dt>
                  <dd className="text-sm font-medium leading-tight">
                    {relatif(statut?.derniereSyncAt ?? null)}
                  </dd>
                </div>
                <div className="rounded-md bg-zinc-50 p-2 dark:bg-zinc-900">
                  <dt className="text-xs text-zinc-500">Dernier test</dt>
                  <dd className="flex items-center gap-1 text-sm font-medium leading-tight">
                    {statut?.dernierTest.ok === true ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    ) : statut?.dernierTest.ok === false ? (
                      <XCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
                    ) : null}
                    {statut?.dernierTest.ok === true
                      ? "OK"
                      : statut?.dernierTest.ok === false
                        ? "Échec"
                        : "—"}
                  </dd>
                </div>
              </dl>
              {statut?.dernierTest.ok === false && statut.dernierTest.erreur && (
                <p className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                  {statut.dernierTest.erreur}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" disabled={syncEnCours} onClick={() => void synchroniser()}>
                  {syncEnCours ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Synchroniser maintenant
                </Button>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Reprise automatique toutes les 30 s — rien n&apos;est perdu en cas de coupure.
                </p>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-zinc-400 dark:text-zinc-500">
                Sécurité : la clé reste stockée uniquement sur ce poste (côté
                serveur), jamais affichée en clair. Les données locales partent
                vers votre projet Supabase et nulle part ailleurs.
              </p>
            </section>
          </TabsContent>

          {/* --------------------------------------------- Journal des sites */}
          <TabsContent value="journal" className="mt-4 space-y-4">
            {!configure ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
                <CloudOff className="h-8 w-8 text-zinc-400" aria-hidden="true" />
                <p className="text-sm font-medium">Base cloud non connectée</p>
                <p className="max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
                  Connectez Supabase dans l&apos;onglet « Connexion » pour
                  consulter ici l&apos;activité de tous les sites (étiquettes
                  générées, fichiers imprimés) et préparer les réceptions W-1.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={filtreSite} onValueChange={setFiltreSite}>
                    <SelectTrigger className="h-9 w-[200px]" aria-label="Filtrer par site">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tous">Tous les sites</SelectItem>
                      {(journal?.parSite ?? []).map((s) => (
                        <SelectItem key={s.siteId} value={s.siteId}>
                          {s.siteLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filtrePeriode} onValueChange={setFiltrePeriode}>
                    <SelectTrigger className="h-9 w-[190px]" aria-label="Filtrer par période">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERIODES_JOURNAL.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                    disabled={journalChargement}
                    onClick={() => void chargerJournal()}
                  >
                    {journalChargement ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    )}
                    Actualiser
                  </Button>
                </div>

                {/* Tuiles de synthèse */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { libelle: "Étiquettes", valeur: journal?.totaux.etiquettes, detail: "générées" },
                    { libelle: "Pièces", valeur: journal?.totaux.pieces, detail: "copies comprises" },
                    { libelle: "Impressions", valeur: journal?.totaux.impressions, detail: "fichiers" },
                    { libelle: "Sites actifs", valeur: journal?.totaux.sitesActifs, detail: "sur la période" },
                  ].map((t) => (
                    <div
                      key={t.libelle}
                      className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
                    >
                      <p className="text-xs text-zinc-500">{t.libelle}</p>
                      <p className="text-xl font-bold leading-tight">
                        {journalChargement && journal === null ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          (t.valeur ?? 0).toLocaleString("fr-FR")
                        )}
                      </p>
                      <p className="text-[11px] text-zinc-400">{t.detail}</p>
                    </div>
                  ))}
                </div>

                {/* Détail par site */}
                {journal && journal.parSite.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {journal.parSite.map((s) => (
                      <Badge
                        key={s.siteId}
                        variant="outline"
                        className="gap-1.5 border-zinc-300 px-2.5 py-1 font-normal dark:border-zinc-700"
                      >
                        {s.siteId === "france-hq" ? (
                          <Building2 className="h-3 w-3 text-amber-600" aria-hidden="true" />
                        ) : (
                          <Factory className="h-3 w-3 text-amber-600" aria-hidden="true" />
                        )}
                        {s.siteLabel} — {s.etiquettes} ét. / {s.pieces} p.
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Dernières étiquettes */}
                <section aria-label="Dernières étiquettes générées">
                  <h3 className="mb-1.5 text-sm font-semibold">Dernières étiquettes générées</h3>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {journalChargement && journal === null ? (
                      <div className="space-y-2 p-3">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="h-8 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
                        ))}
                      </div>
                    ) : !journal || journal.etiquettes.length === 0 ? (
                      <p className="p-4 text-center text-sm text-zinc-500">
                        Aucune étiquette sur la période sélectionnée.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                          <tr>
                            <th className="px-2.5 py-2 font-medium">Site</th>
                            <th className="px-2.5 py-2 font-medium">Modèle</th>
                            <th className="px-2.5 py-2 font-medium">Couleur</th>
                            <th className="px-2.5 py-2 font-medium">Taille</th>
                            <th className="px-2.5 py-2 font-medium">OF</th>
                            <th className="px-2.5 py-2 text-right font-medium">Qté</th>
                            <th className="px-2.5 py-2 text-right font-medium">Quand</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                          {journal.etiquettes.map((e, i) => (
                            <tr key={`${e.siteId}-${e.genereAt}-${i}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                              <td className="px-2.5 py-1.5 text-xs text-zinc-500">{e.siteLabel}</td>
                              <td className="px-2.5 py-1.5 font-medium">{e.modele || "—"}</td>
                              <td className="px-2.5 py-1.5">{e.couleur || "—"}</td>
                              <td className="px-2.5 py-1.5">{e.taille || "—"}</td>
                              <td className="px-2.5 py-1.5 font-mono text-xs">{e.of || "—"}</td>
                              <td className="px-2.5 py-1.5 text-right">
                                {e.quantite > 1 ? (
                                  <Badge className="bg-amber-600 text-white hover:bg-amber-600">×{e.quantite}</Badge>
                                ) : (
                                  "1"
                                )}
                              </td>
                              <td className="px-2.5 py-1.5 text-right text-xs text-zinc-500">
                                {relatif(e.genereAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>

                {/* Derniers fichiers imprimés */}
                <section aria-label="Derniers fichiers imprimés">
                  <h3 className="mb-1.5 text-sm font-semibold">Derniers fichiers produits</h3>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {!journal || journal.impressions.length === 0 ? (
                      <p className="p-3 text-center text-sm text-zinc-500">
                        Aucun fichier sur la période.
                      </p>
                    ) : (
                      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {journal.impressions.map((f, i) => (
                          <li key={`${f.siteId}-${f.eventAt}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                            {f.kind === "NLBL" ? (
                              <Printer className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                            )}
                            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={f.filename}>
                              {f.filename}
                            </span>
                            <Badge variant="outline" className="font-normal text-zinc-500">
                              {f.labelsCount} ét.
                            </Badge>
                            <span className="w-24 shrink-0 truncate text-right text-xs text-zinc-500" title={f.siteLabel}>
                              {f.siteLabel}
                            </span>
                            <span className="w-16 shrink-0 text-right text-xs text-zinc-400">
                              {relatif(f.eventAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              </>
            )}
          </TabsContent>

          {/* ------------------------------------------------------- Guide */}
          <TabsContent value="guide" className="mt-4 space-y-4">
            <ol className="space-y-3">
              {[
                {
                  titre: "Créer le projet Supabase (gratuit)",
                  texte: "Sur supabase.com → New project. Région conseillée : Europe de l'Ouest (Paris / Francfort). Conservez le mot de passe de la base proposé.",
                  lien: true,
                },
                {
                  titre: "Créer les tables",
                  texte: "Menu SQL Editor → New query → collez le script ci-dessous → Run. 5 tables sont créées (étiquettes, impressions, réceptions, lignes, scans).",
                  boutonSql: true,
                },
                {
                  titre: "Connexion de l'application",
                  texte: "Sur cette installation, la connexion est déjà faite via le fichier cloud.config.json (URL + clé enregistrées sur le serveur par Clément Design) : rien à saisir. Sur une installation neuve, collez l'URL et la clé dans l'onglet « Connexion » puis « Enregistrer et connecter ».",
                },
                {
                  titre: "Comptes et sites",
                  texte: "Chaque utilisateur se connecte avec son compte : Archipel et Nastex (Tunisie, génération d'étiquettes) et Clément — Carros (France, réception + colisage + génération). Chaque étiquette, impression et scan est signé du site correspondant dans la base partagée.",
                },
              ].map((etape, i) => (
                <li key={etape.titre} className="flex gap-3">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{etape.titre}</p>
                    <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                      {etape.texte}
                    </p>
                    {etape.boutonSql && (
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => void copierScriptSql()}>
                        {copieSql ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        )}
                        {copieSql ? "Script copié" : "Copier le script SQL"}
                      </Button>
                    )}
                    {etape.lien && (
                      <a
                        href="https://supabase.com/dashboard/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
                      >
                        Ouvrir supabase.com
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {/* Schéma multi-sites */}
            <section
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
              aria-label="Vue d'ensemble multi-sites"
            >
              <h3 className="mb-3 text-sm font-semibold">Vue d&apos;ensemble — flux W-1</h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="space-y-2">
                  {[
                    { icone: Building2, texte: "France — Clément Design (Carros)" },
                    { icone: Factory, texte: "Tunisie — Archipel" },
                    { icone: Factory, texte: "Tunisie — Nastex" },
                  ].map(({ icone: Icone, texte }) => (
                    <div
                      key={texte}
                      className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <Icone className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                      {texte}
                    </div>
                  ))}
                </div>
                <ArrowDown className="mx-auto h-5 w-5 rotate-90 text-zinc-400 sm:rotate-0" aria-hidden="true" />
                <div className="rounded-md border border-amber-500/60 bg-amber-50 px-3 py-3 text-center dark:bg-amber-950/40">
                  <Database className="mx-auto mb-1 h-4 w-4 text-amber-600" aria-hidden="true" />
                  <p className="text-xs font-semibold">Base Supabase partagée</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    étiquettes · impressions · réceptions · scans
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                Semaine N : le façonnier (Archipel ou Nastex) imprime ses
                étiquettes (visibles immédiatement dans la base). Semaine N+1 :
                Clément Design réceptionne les pièces et compare les scans au
                prévu depuis l&apos;espace Colisage.
              </p>
            </section>

            <p className="rounded-md border border-zinc-200 p-3 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              <strong className="font-semibold text-zinc-700 dark:text-zinc-300">
                Accès multi-utilisateurs complet :
              </strong>{" "}
              tant que l&apos;application tourne sur un poste local, chaque site
              voit ici l&apos;activité des autres via la base cloud. Pour que les
              façonniers utilisent l&apos;application directement dans leur
              navigateur (sans installation), l&apos;application sera déployée en
              ligne avec Supabase comme base principale — chemin documenté dans
              README-SUPABASE.md.
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
