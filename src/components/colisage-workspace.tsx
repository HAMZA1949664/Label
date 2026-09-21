"use client";

/**
 * Espace de travail « Colisage » : transformation de 3 000 à 4 000 codes-barres
 * scannés (collés ou importés) en colisage regroupé, sans saisie ligne à ligne.
 * Regroupement : OF → modèle → couleur → taille, quantités comptées
 * automatiquement (un code rescanné = une pièce de plus).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  FileUp,
  Hash,
  Loader2,
  Lock,
  LockOpen,
  Package,
  PackageCheck,
  Plus,
  ScanLine,
  Trash2,
  Truck,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  construireCsvColisage,
  extraireCodes,
  horodatageFichier,
  TAILLE_MAX_TEXTE_COLISAGE,
  type ResultatColisage,
} from "@/lib/colisage";
import type {
  EtatReception,
  ResumeReception,
} from "@/lib/receptions";

/** Nombre maximal de lignes rendues dans le tableau (au-delà : bouton « tout afficher »). */
const MAX_LIGNES_RENDUES = 400;

/**
 * Bornes de la semaine dernière (lundi → dimanche) en Europe/Paris —
 * proposition par défaut de la création de réception (le façonnier imprime
 * la semaine N, les pièces arrivent la semaine N+1).
 */
function semainePassee(): { du: string; au: string } {
  const fmt = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const p = Object.fromEntries(
    fmt.formatToParts(new Date()).map((x) => [x.type, x.value])
  );
  const aujourdhui = new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  const joursDepuisLundi = (aujourdhui.getUTCDay() + 6) % 7;
  const lundi = new Date(aujourdhui);
  lundi.setUTCDate(lundi.getUTCDate() - joursDepuisLundi - 7);
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(dimanche.getUTCDate() + 6);
  return { du: lundi.toISOString().slice(0, 10), au: dimanche.toISOString().slice(0, 10) };
}

export function ColisageWorkspace() {
  const { toast } = useToast();

  const [texteBrut, setTexteBrut] = useState("");
  const [ofsSaisis, setOfsSaisis] = useState("");
  const [resultat, setResultat] = useState<ResultatColisage | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [depotActif, setDepotActif] = useState(false);
  const [toutAfficher, setToutAfficher] = useState(false);
  const [tableCopiee, setTableCopiee] = useState(false);

  // --------------------- Réception prévue (façonnier) ---------------------
  const [receptions, setReceptions] = useState<ResumeReception[]>([]);
  const [receptionsChargees, setReceptionsChargees] = useState(false);
  const [receptionId, setReceptionId] = useState<string>("");
  const [etat, setEtat] = useState<EtatReception | null>(null);
  const [etatEnCours, setEtatEnCours] = useState(false);
  const [codesAnalyses, setCodesAnalyses] = useState<string[]>([]);
  const [pointageEnCours, setPointageEnCours] = useState(false);
  const [dialogueCreation, setDialogueCreation] = useState(false);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [nouveauTitre, setNouveauTitre] = useState("");
  const [modeSource, setModeSource] = useState<"periode" | "of">("periode");
  const [ofsCreation, setOfsCreation] = useState("");
  const bornesDefaut = useRef(semainePassee());
  const [duCreation, setDuCreation] = useState(bornesDefaut.current.du);
  const [auCreation, setAuCreation] = useState(bornesDefaut.current.au);
  const [confirmationSuppression, setConfirmationSuppression] = useState(false);
  const [actionEnCours, setActionEnCours] = useState(false);

  const receptionSelectionnee = receptions.find((r) => r.id === receptionId);
  const cloturee = etat?.reception.statut === "cloturee";

  const fichierRef = useRef<HTMLInputElement>(null);
  const compteurDepot = useRef(0);

  /** Codes 13 chiffres détectés dans le texte collé / importé (doublons compris). */
  const codesDetectes = useMemo(() => extraireCodes(texteBrut).length, [texteBrut]);

  const peutGenerer = codesDetectes > 0 && !enCours;

  // -------------------------------------------------------------------------
  // Import fichier : extraction des codes 13 chiffres (liste, export multi-
  // colonnes, présence ou non d'en-tête) — même logique que l'outil d'origine.
  // -------------------------------------------------------------------------
  async function importerFichier(fichier: File) {
    if (fichier.size > TAILLE_MAX_TEXTE_COLISAGE) {
      toast({
        title: "Fichier trop volumineux",
        description: `Taille maximale : ${Math.round(TAILLE_MAX_TEXTE_COLISAGE / 1_000_000)} Mo.`,
        variant: "destructive",
      });
      return;
    }
    const estTexte =
      /\.txt$|\.csv$|\.text$/i.test(fichier.name) || fichier.type.startsWith("text/");
    if (!estTexte) {
      toast({
        title: "Format non pris en charge",
        description: "Importez un fichier .txt ou .csv contenant les codes-barres.",
        variant: "destructive",
      });
      return;
    }
    try {
      const contenu = await fichier.text();
      const codes = extraireCodes(contenu);
      if (codes.length === 0) {
        toast({
          title: "Aucun code-barres trouvé",
          description: `Aucun code à 13 chiffres détecté dans « ${fichier.name} ».`,
          variant: "destructive",
        });
        return;
      }
      setTexteBrut((precedent) => {
        const base = precedent.trim();
        const ajoute = codes.join("\n");
        return base ? `${base}\n${ajoute}` : ajoute;
      });
      setResultat(null);
      setErreur(null);
      toast({
        title: `${codes.length.toLocaleString("fr-FR")} code(s)-barres importé(s)`,
        description: `Depuis « ${fichier.name} » — vérifiez le total puis générez le colisage.`,
      });
    } catch {
      toast({
        title: "Lecture impossible",
        description: "Le fichier n'a pas pu être lu.",
        variant: "destructive",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Génération : envoi des codes au serveur (décodage SPE inclus)
  // -------------------------------------------------------------------------
  async function generer() {
    const codes = extraireCodes(texteBrut);
    if (codes.length === 0) {
      toast({
        title: "Aucun code-barres à analyser",
        description: "Collez d'abord vos codes (un par ligne) ou importez un fichier.",
        variant: "destructive",
      });
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const ofs = ofsSaisis
        .split(/[\s,;]+/)
        .map((o) => o.trim())
        .filter(Boolean);
      const reponse = await fetch("/api/colisage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes, ...(ofs.length > 0 ? { ofs } : {}) }),
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        const message =
          (corps && typeof corps.error === "string" && corps.error) ||
          "Échec de la génération du colisage.";
        setErreur(message);
        toast({ title: "Colisage impossible", description: message, variant: "destructive" });
        return;
      }
      setResultat(corps as ResultatColisage);
      setCodesAnalyses(codes);
      setToutAfficher(false);
      const s = (corps as ResultatColisage).stats;
      toast({
        title: "Colisage généré",
        description: `${s.total.toLocaleString("fr-FR")} codes analysés en ${s.dureeMs} ms — ${s.skus.toLocaleString("fr-FR")} ligne(s), ${s.inconnusQuantite} inconnu(s).`,
      });
    } catch {
      const message = "Connexion au serveur impossible. Réessayez.";
      setErreur(message);
      toast({ title: "Erreur réseau", description: message, variant: "destructive" });
    } finally {
      setEnCours(false);
    }
  }

  // -------------------------------------------------------------------------
  // Exports : CSV (Excel) et copie du tableau (presse-papiers, TSV)
  // -------------------------------------------------------------------------
  function telechargerCsv() {
    if (!resultat || resultat.lignes.length === 0) return;
    const blob = new Blob([construireCsvColisage(resultat.lignes)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `colisage_${horodatageFichier()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast({
      title: "Colisage exporté (CSV)",
      description: `${resultat.lignes.length.toLocaleString("fr-FR")} ligne(s) — colisage_${horodatageFichier()}.csv`,
    });
  }

  async function copierTableau() {
    if (!resultat || resultat.lignes.length === 0) return;
    const tsv = ["OF\tModèle\tCouleur\tTaille\tQté\tManche"]
      .concat(
        resultat.lignes.map(
          (l) => `${l.of || "-"}\t${l.modele}\t${l.couleur}\t${l.taille}\t${l.quantite}\t${l.manche || "-"}`
        )
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      setTableCopiee(true);
      window.setTimeout(() => setTableCopiee(false), 1600);
      toast({
        title: "Tableau copié",
        description: "Collez-le directement dans Excel ou votre ERP.",
      });
    } catch {
      toast({
        title: "Copie impossible",
        description: "Le navigateur a refusé l'accès au presse-papiers.",
        variant: "destructive",
      });
    }
  }

  function vider() {
    setTexteBrut("");
    setOfsSaisis("");
    setResultat(null);
    setErreur(null);
    setToutAfficher(false);
  }

  // -------------------------------------------------------------------------
  // Réception prévue : chargement, pointage des scans, création, clôture.
  // -------------------------------------------------------------------------
  const chargerReceptions = useCallback(async () => {
    try {
      const reponse = await fetch("/api/receptions", { cache: "no-store" });
      const corps = await reponse.json().catch(() => null);
      if (reponse.ok && corps && Array.isArray(corps.receptions)) {
        setReceptions(corps.receptions as ResumeReception[]);
      }
    } catch {
      // Silencieux : la liste se rechargera au prochain passage.
    } finally {
      setReceptionsChargees(true);
    }
  }, []);

  const chargerEtat = useCallback(async (id: string) => {
    if (!id) {
      setEtat(null);
      return;
    }
    setEtatEnCours(true);
    try {
      const reponse = await fetch(`/api/receptions/${id}`, { cache: "no-store" });
      const corps = await reponse.json().catch(() => null);
      if (reponse.ok && corps && corps.reception) {
        setEtat(corps as EtatReception);
      } else {
        setEtat(null);
        setReceptionId("");
      }
    } catch {
      setEtat(null);
    } finally {
      setEtatEnCours(false);
    }
  }, []);

  useEffect(() => {
    void chargerReceptions();
  }, [chargerReceptions]);

  useEffect(() => {
    void chargerEtat(receptionId);
  }, [receptionId, chargerEtat]);

  async function pointerScans() {
    if (!receptionId || codesAnalyses.length === 0) return;
    setPointageEnCours(true);
    try {
      const reponse = await fetch(`/api/receptions/${receptionId}/pointer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: codesAnalyses }),
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        const message =
          (corps && typeof corps.error === "string" && corps.error) ||
          "Pointage impossible.";
        toast({ title: "Pointage impossible", description: message, variant: "destructive" });
        return;
      }
      setEtat(corps as EtatReception);
      const resume = (corps as EtatReception).resume;
      toast({
        title: `${codesAnalyses.length.toLocaleString("fr-FR")} pièce(s) pointée(s) sur la réception`,
        description: `Reçu ${resume.recuTotal.toLocaleString("fr-FR")} / ${resume.attenduTotal.toLocaleString("fr-FR")} attendu(s) — ${resume.tauxPct} %.`,
      });
      void chargerReceptions();
    } catch {
      toast({
        title: "Erreur réseau",
        description: "Connexion au serveur impossible. Réessayez.",
        variant: "destructive",
      });
    } finally {
      setPointageEnCours(false);
    }
  }

  async function creerReception() {
    const titre = nouveauTitre.trim();
    if (titre.length === 0) {
      toast({
        title: "Titre requis",
        description: "Donnez un nom à la réception (ex. « Réception semaine 38 »).",
        variant: "destructive",
      });
      return;
    }
    setCreationEnCours(true);
    try {
      const source =
        modeSource === "of"
          ? {
              mode: "of" as const,
              ofs: ofsCreation
                .split(/[\s,;]+/)
                .map((o) => o.trim())
                .filter(Boolean),
            }
          : { mode: "periode" as const, du: duCreation, au: auCreation };
      const reponse = await fetch("/api/receptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre, source }),
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        const message =
          (corps && typeof corps.error === "string" && corps.error) ||
          "Création impossible.";
        toast({ title: "Création impossible", description: message, variant: "destructive" });
        return;
      }
      setDialogueCreation(false);
      setNouveauTitre("");
      await chargerReceptions();
      if (corps && typeof corps.id === "string") setReceptionId(corps.id);
      toast({
        title: "Réception créée",
        description: `« ${titre} » — ${corps?.lignes ?? 0} ligne(s) attendue(s) depuis les étiquettes générées.`,
      });
    } catch {
      toast({
        title: "Erreur réseau",
        description: "Connexion au serveur impossible. Réessayez.",
        variant: "destructive",
      });
    } finally {
      setCreationEnCours(false);
    }
  }

  async function basculerCloture() {
    if (!receptionId || !etat) return;
    setActionEnCours(true);
    try {
      const nouveauStatut = cloturee ? "ouverte" : "cloturee";
      const reponse = await fetch(`/api/receptions/${receptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: nouveauStatut }),
      });
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => null);
        toast({
          title: "Action impossible",
          description: (corps && typeof corps.error === "string" && corps.error) || "Réessayez.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: nouveauStatut === "cloturee" ? "Réception clôturée" : "Réception rouverte",
        description:
          nouveauStatut === "cloturee"
            ? "Le pointage est verrouillé — état figé pour l'export."
            : "Le pointage est de nouveau possible.",
      });
      await chargerEtat(receptionId);
      void chargerReceptions();
    } finally {
      setActionEnCours(false);
    }
  }

  async function supprimerReception() {
    if (!receptionId) return;
    setActionEnCours(true);
    try {
      const reponse = await fetch(`/api/receptions/${receptionId}`, { method: "DELETE" });
      if (!reponse.ok) {
        const corps = await reponse.json().catch(() => null);
        toast({
          title: "Suppression impossible",
          description: (corps && typeof corps.error === "string" && corps.error) || "Réessayez.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Réception supprimée", description: "Les étiquettes générées restent en base." });
      setReceptionId("");
      setEtat(null);
      await chargerReceptions();
    } finally {
      setActionEnCours(false);
      setConfirmationSuppression(false);
    }
  }

  // Sous-totaux par OF (colonne OF : « 078594 · 152 p. »)
  const sousTotauxOf = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of resultat?.lignes ?? []) {
      if (!l.of) continue;
      map.set(l.of, (map.get(l.of) ?? 0) + l.quantite);
    }
    return map;
  }, [resultat]);

  const lignesRendues =
    resultat === null || toutAfficher
      ? (resultat?.lignes ?? [])
      : resultat.lignes.slice(0, MAX_LIGNES_RENDUES);

  const nbCachees = (resultat?.lignes.length ?? 0) - lignesRendues.length;

  return (
    <div className="space-y-6" aria-label="Génération de colisage">
      {/* ------------------------- Saisie des codes ------------------------- */}
      <Card
        className={`card-lift relative transition-shadow ${
          depotActif ? "ring-2 ring-amber-500/70 ring-offset-2 ring-offset-background dark:ring-offset-zinc-950" : ""
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          compteurDepot.current += 1;
          setDepotActif(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          compteurDepot.current -= 1;
          if (compteurDepot.current <= 0) {
            compteurDepot.current = 0;
            setDepotActif(false);
          }
        }}
        onDrop={async (e) => {
          e.preventDefault();
          compteurDepot.current = 0;
          setDepotActif(false);
          const fichier = e.dataTransfer.files?.[0];
          if (fichier) await importerFichier(fichier);
        }}
      >
        {depotActif && (
          <div
            className="depot-voile pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-amber-500 bg-amber-50/90 dark:bg-zinc-950/90"
            aria-hidden="true"
          >
            <div className="flex items-center gap-3 text-amber-800 dark:text-amber-300">
              <FileUp className="depot-icone h-8 w-8" />
              <p className="text-lg font-bold">Déposez le fichier de codes ici</p>
            </div>
          </div>
        )}

        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Génération du colisage
            </span>
            <Badge variant="secondary" aria-live="polite">
              {codesDetectes.toLocaleString("fr-FR")} code(s) détecté(s)
            </Badge>
          </CardTitle>
          <CardDescription>
            Collez tous les codes-barres scannés à la douchette (un par ligne,
            3 000 à 4 000 lignes acceptées) ou importez un fichier. Le colisage
            est regroupé automatiquement : <strong>OF → modèle → couleur →
            taille</strong>, quantités comptées — aucune saisie ligne à ligne.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="codes-colisage">Codes-barres scannés</Label>
            <Textarea
              id="codes-colisage"
              value={texteBrut}
              onChange={(e) => {
                setTexteBrut(e.target.value);
                setResultat(null);
                setErreur(null);
              }}
              placeholder={"3700791700130\n3700791700147\n3700791700154\n…"}
              className="min-h-44 resize-y font-mono text-sm leading-relaxed"
              spellCheck={false}
              autoComplete="off"
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ScanLine className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Les codes inconnus ou illisibles sont signalés mais ne bloquent
              jamais le colisage. Les doublons sont comptés comme plusieurs pièces.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ofs-colisage">
                N° d&apos;OF du lot{" "}
                <span className="font-normal text-muted-foreground">(facultatif)</span>
              </Label>
              <Input
                id="ofs-colisage"
                value={ofsSaisis}
                onChange={(e) => setOfsSaisis(e.target.value)}
                placeholder="ex. 078594, 078910"
                className="h-10 font-mono"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Aide au décodage des codes SPE (préfixe 99). Les OF déjà générés
                via l&apos;application sont reconnus automatiquement.
              </p>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <input
                ref={fichierRef}
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const fichier = e.target.files?.[0];
                  if (fichier) await importerFichier(fichier);
                  e.target.value = "";
                }}
                aria-hidden="true"
                tabIndex={-1}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => fichierRef.current?.click()}
                    className="h-10 w-full"
                  >
                    <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
                    Importer un fichier de codes
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>.txt / .csv — les codes 13 chiffres sont extraits automatiquement, ou glissez le fichier sur la carte</p>
                </TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                onClick={vider}
                disabled={!texteBrut && !resultat && !ofsSaisis}
                className="h-10 w-full"
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Tout effacer
              </Button>
            </div>
          </div>

          {erreur && (
            <p
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300"
              role="alert"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {erreur}
            </p>
          )}
        </CardContent>

        <CardFooter className="border-t bg-zinc-50/60 p-4 dark:bg-zinc-900/60">
          <Button
            onClick={generer}
            disabled={!peutGenerer}
            className="btn-shine h-12 w-full bg-amber-600 text-base font-semibold text-white hover:bg-amber-700"
          >
            {enCours ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <ClipboardList className="mr-2 h-5 w-5" aria-hidden="true" />
            )}
            {enCours ? "Analyse en cours…" : "Générer le colisage"}
          </Button>
        </CardFooter>
      </Card>

      {/* ------------------- Réception prévue (façonnier) ------------------- */}
      <Card className="card-lift" aria-label="Réception prévue">
        <CardHeader className="pb-4">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Réception prévue
              {etat && (
                <Badge
                  variant="outline"
                  className={
                    cloturee
                      ? "border-zinc-400 text-zinc-500"
                      : "border-green-600/60 text-green-700 dark:text-green-400"
                  }
                >
                  {cloturee ? "clôturée" : "ouverte"}
                </Badge>
              )}
            </span>
            <span className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogueCreation(true)}
                className="h-8 px-2 text-xs"
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Nouvelle
              </Button>
              {etat && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={basculerCloture}
                    disabled={actionEnCours}
                    className="h-8 px-2 text-xs text-zinc-500 hover:text-amber-700"
                  >
                    {actionEnCours ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : cloturee ? (
                      <LockOpen className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Lock className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {cloturee ? "Rouvrir" : "Clôturer"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmationSuppression(true)}
                    disabled={actionEnCours}
                    className="h-8 px-2 text-xs text-zinc-500 hover:text-red-600"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Supprimer
                  </Button>
                </>
              )}
            </span>
          </CardTitle>
          <CardDescription>
            Le façonnier imprime la semaine N, vous réceptionnez la semaine
            N+1 : créez la réception depuis les étiquettes générées, puis
            pointez les scans pour comparer <strong>attendu / reçu / écart</strong>.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Sélecteur de réception */}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={receptionId || undefined}
              onValueChange={(v) => setReceptionId(v)}
            >
              <SelectTrigger
                className="h-10 w-full sm:w-[26rem]"
                aria-label="Sélectionner la réception prévue"
              >
                <SelectValue
                  placeholder={
                    receptionsChargees && receptions.length === 0
                      ? "Aucune réception — créez-en une"
                      : "Choisir une réception…"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {receptions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    <span className="flex items-baseline gap-2">
                      <span className="font-medium">{r.titre}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {r.recuTotal.toLocaleString("fr-FR")} /{" "}
                        {r.attenduTotal.toLocaleString("fr-FR")} p. · {r.tauxPct} %
                        {r.statut === "cloturee" ? " · clôturée" : ""}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {etatEnCours && (
              <Loader2 className="h-4 w-4 animate-spin text-amber-600" aria-hidden="true" />
            )}
          </div>

          {/* État de la réception sélectionnée */}
          {etat && (
            <>
              {/* Résumé + progression */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  {
                    icone: ClipboardList,
                    valeur: etat.resume.attenduTotal,
                    libelle: "Attendu",
                  },
                  {
                    icone: PackageCheck,
                    valeur: etat.resume.recuTotal,
                    libelle: "Reçu (prévu)",
                  },
                  {
                    icone: AlertTriangle,
                    valeur: Math.max(0, etat.resume.attenduTotal - etat.resume.recuTotal),
                    libelle: "Manquant",
                  },
                  {
                    icone: Boxes,
                    valeur: etat.resume.horsPrevueQuantite + etat.resume.inconnusQuantite,
                    libelle: "Hors prévu / inconnu",
                  },
                ].map(({ icone: Icone, valeur, libelle }) => (
                  <div
                    key={libelle}
                    className="rounded-lg border bg-white p-3 text-center dark:bg-zinc-900"
                  >
                    <dd className="flex items-center justify-center gap-1.5 font-serif text-xl font-semibold tabular-nums">
                      <Icone className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      {valeur.toLocaleString("fr-FR")}
                    </dd>
                    <dt className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {libelle}
                    </dt>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {etat.resume.lignesCompletes}/{etat.resume.lignesTotal} ligne(s)
                    complète(s) — {etat.resume.lignesPartielles} partielle(s),{" "}
                    {etat.resume.lignesZero} à zéro
                  </span>
                  <span className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                    {etat.resume.tauxPct} %
                  </span>
                </div>
                <Progress
                  value={etat.resume.tauxPct}
                  aria-label={`Réception à ${etat.resume.tauxPct} %`}
                />
              </div>

              {/* Pointage du lot scanné */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
                <p className="text-xs text-muted-foreground">
                  {codesAnalyses.length > 0
                    ? `${codesAnalyses.length.toLocaleString("fr-FR")} code(s) scanné(s) dans le lot analysé ci-dessus.`
                    : "Analysez d'abord un lot de codes pour le pointer sur cette réception."}
                </p>
                <Button
                  onClick={pointerScans}
                  disabled={
                    pointageEnCours || codesAnalyses.length === 0 || cloturee
                  }
                  className="h-10 bg-green-700 font-semibold text-white hover:bg-green-800"
                >
                  {pointageEnCours ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <PackageCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {cloturee
                    ? "Réception clôturée"
                    : `Pointer les ${codesAnalyses.length.toLocaleString("fr-FR")} scan(s)`}
                </Button>
              </div>

              {/* Tableau attendu / reçu / écart */}
              <div className="overflow-hidden rounded-lg border">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">
                      État de la réception : attendu, reçu et écart par ligne
                    </caption>
                    <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0] shadow-zinc-200 dark:bg-zinc-900 dark:shadow-zinc-700">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left font-semibold">OF</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold">Modèle</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold">Couleur</th>
                        <th scope="col" className="px-3 py-2 text-left font-semibold">Taille</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Attendu</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Reçu</th>
                        <th scope="col" className="px-3 py-2 text-right font-semibold">Écart</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {etat.lignes.map((l) => (
                        <tr
                          key={l.id}
                          className="transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-950/20"
                        >
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                            {l.of || <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-1.5 font-medium">{l.modele}</td>
                          <td className="px-3 py-1.5">
                            {l.couleur}
                            {l.couleurCode && (
                              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                                {l.couleurCode}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs">{l.taille}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {l.attendu}
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                            {l.recu}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Badge
                              variant="outline"
                              className={
                                l.statut === "complet"
                                  ? "border-green-600/50 text-green-700 dark:text-green-400"
                                  : l.statut === "excedent"
                                    ? "border-red-500/50 text-red-700 dark:text-red-400"
                                    : l.statut === "partiel"
                                      ? "border-amber-600/50 text-amber-700 dark:text-amber-400"
                                      : "border-zinc-400/60 text-zinc-500"
                              }
                            >
                              {l.ecart > 0 ? `+${l.ecart}` : l.ecart}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Codes hors prévue / inconnus pointés */}
              {(etat.horsPrevue.length > 0 || etat.inconnus.length > 0) && (
                <div
                  className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-950/20"
                  role="note"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {etat.resume.horsPrevueQuantite} pièce(s) hors prévue ·{" "}
                    {etat.resume.inconnusQuantite} inconnue(s) — pointées mais
                    sans ligne attendue
                  </p>
                  <div className="mt-2 max-h-24 overflow-y-auto rounded border border-amber-200 bg-white p-2 font-mono text-xs leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-zinc-950 dark:text-amber-200">
                    {etat.horsPrevue.map((h) => (
                      <div key={h.code} className="flex justify-between gap-3">
                        <span>
                          {h.code}
                          <span className="ml-2 font-sans text-[11px] text-muted-foreground">
                            {h.modele}
                          </span>
                        </span>
                        <span className="tabular-nums">× {h.quantite}</span>
                      </div>
                    ))}
                    {etat.inconnus.map((i) => (
                      <div key={i.code} className="flex justify-between gap-3">
                        <span>{i.code}</span>
                        <span className="tabular-nums">× {i.quantite}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!etat && !etatEnCours && receptionId === "" && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {receptions.length === 0
                ? "Aucune réception pour l'instant. Cliquez sur « Nouvelle » pour préparer la réception des pièces imprimées par le façonnier (semaine N → réception N+1) — les lignes attendues sont calculées depuis les étiquettes déjà générées et enregistrées en base."
                : "Sélectionnez une réception dans la liste pour voir l'état attendu / reçu."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ------------------------- Résultat ------------------------- */}
      {resultat && (
        <Card className="card-lift">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-amber-600" aria-hidden="true" />
                Colisage regroupé
              </span>
              <span className="flex gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copierTableau}
                      className="h-8 px-2 text-xs text-zinc-500 hover:text-amber-700"
                    >
                      {tableCopiee ? (
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                      ) : (
                        <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {tableCopiee ? "Copié" : "Copier"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copier le tableau (collable dans Excel / ERP)</p>
                  </TooltipContent>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={telechargerCsv}
                  className="h-8 px-2 text-xs text-zinc-500 hover:text-amber-700"
                >
                  <FileSpreadsheet className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  CSV
                </Button>
              </span>
            </CardTitle>
            <CardDescription>
              Quantités comptées automatiquement — même code scanné plusieurs
              fois = plusieurs pièces.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Statistiques du scan */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { icone: Hash, valeur: resultat.stats.total, libelle: "Codes scannés" },
                { icone: CheckCircle2, valeur: resultat.stats.reconnus, libelle: "Reconnus" },
                { icone: Boxes, valeur: resultat.stats.skus, libelle: "Lignes" },
                { icone: Package, valeur: resultat.stats.ofs, libelle: "OF identifiés" },
              ].map(({ icone: Icone, valeur, libelle }) => (
                <div
                  key={libelle}
                  className="rounded-lg border bg-white p-3 text-center dark:bg-zinc-900"
                >
                  <dd className="flex items-center justify-center gap-1.5 font-serif text-xl font-semibold tabular-nums">
                    <Icone className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    {valeur.toLocaleString("fr-FR")}
                  </dd>
                  <dt className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {libelle}
                  </dt>
                </div>
              ))}
            </dl>

            {/* Codes inconnus */}
            {resultat.inconnus.length > 0 && (
              <div
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-950/20"
                role="note"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {resultat.stats.inconnusQuantite} code(s) inconnu(s) —{" "}
                  {resultat.inconnus.length} référence(s) absente(s) de la base
                </p>
                <div className="mt-2 max-h-28 overflow-y-auto rounded border border-amber-200 bg-white p-2 font-mono text-xs leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-zinc-950 dark:text-amber-200">
                  {resultat.inconnus.map((i) => (
                    <div key={i.code} className="flex justify-between gap-3">
                      <span>{i.code}</span>
                      <span className="tabular-nums">× {i.quantite}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tableau du colisage */}
            <div className="overflow-hidden rounded-lg border">
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Colisage regroupé par OF, modèle, couleur et taille
                  </caption>
                  <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0] shadow-zinc-200 dark:bg-zinc-900 dark:shadow-zinc-700">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">OF</th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Modèle</th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Couleur</th>
                      <th scope="col" className="px-3 py-2 text-left font-semibold">Taille</th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">Qté</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lignesRendues.map((l, idx) => {
                      const precedente = lignesRendues[idx - 1];
                      const nouveauOf = !!l.of && l.of !== (precedente?.of ?? "");
                      const finOf = l.of !== "" && lignesRendues[idx + 1]?.of !== l.of;
                      return (
                        <tr
                          key={`${l.of}|${l.modele}|${l.couleur}|${l.taille}|${l.manche}`}
                          className={`transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-950/20 ${
                            nouveauOf ? "border-t-2 border-t-zinc-300 dark:border-t-zinc-600" : ""
                          }`}
                        >
                          <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                            {l.of ? (
                              <span className="inline-flex flex-col leading-tight">
                                <span>{l.of}</span>
                                {finOf && (
                                  <span className="text-[10px] tabular-nums text-muted-foreground">
                                    {(sousTotauxOf.get(l.of) ?? 0).toLocaleString("fr-FR")} pièces
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-medium">{l.modele}</td>
                          <td className="px-3 py-1.5">
                            {l.couleur}
                            <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                              {l.couleurCode}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs">{l.taille}</td>
                          <td className="px-3 py-1.5 text-right font-bold tabular-nums">
                            {l.quantite}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {nbCachees > 0 && (
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  + {nbCachees.toLocaleString("fr-FR")} ligne(s) masquée(s) pour la fluidité
                </span>
                <Button variant="outline" size="sm" onClick={() => setToutAfficher(true)}>
                  Tout afficher
                </Button>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t bg-zinc-50/60 p-4 dark:bg-zinc-900/60">
            <p className="text-xs text-muted-foreground">
              Analyse de {resultat.stats.total.toLocaleString("fr-FR")} codes en{" "}
              {resultat.stats.dureeMs} ms
              {resultat.stats.ofs > 0 &&
                ` — ${resultat.stats.ofs} OF distinct(s)`}
            </p>
            <Button
              onClick={telechargerCsv}
              className="h-10 bg-amber-600 font-semibold text-white hover:bg-amber-700"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
              Exporter le colisage (CSV)
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* ------------------- Dialogue : nouvelle réception ------------------- */}
      <Dialog open={dialogueCreation} onOpenChange={setDialogueCreation}>
        <DialogContent className="sm:max-w-md" aria-label="Créer une réception prévue">
          <DialogHeader>
            <DialogTitle>Nouvelle réception prévue</DialogTitle>
            <DialogDescription>
              Les lignes attendues sont calculées depuis les étiquettes déjà
              générées et enregistrées en base (copies comprises), regroupées
              par OF → modèle → couleur → taille.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="titre-reception">Titre de la réception</Label>
              <Input
                id="titre-reception"
                value={nouveauTitre}
                onChange={(e) => setNouveauTitre(e.target.value)}
                placeholder="ex. Réception semaine 38 — façonnier"
                maxLength={120}
                autoComplete="off"
              />
            </div>

            <RadioGroup
              value={modeSource}
              onValueChange={(v) => setModeSource(v as "periode" | "of")}
              className="flex gap-4"
              aria-label="Source des lignes attendues"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="periode" id="src-periode" />
                <Label htmlFor="src-periode" className="cursor-pointer font-normal">
                  Par période
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="of" id="src-of" />
                <Label htmlFor="src-of" className="cursor-pointer font-normal">
                  Par N° d&apos;OF
                </Label>
              </div>
            </RadioGroup>

            {modeSource === "periode" ? (
              <div className="space-y-2">
                <Label>
                  Étiquettes générées entre deux dates (Europe/Paris)
                </Label>
                <div className="flex items-center gap-2">
                  <CalendarRange
                    className="h-4 w-4 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                  <Input
                    type="date"
                    value={duCreation}
                    onChange={(e) => setDuCreation(e.target.value)}
                    aria-label="Date de début (génération des étiquettes)"
                    className="h-10"
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input
                    type="date"
                    value={auCreation}
                    onChange={(e) => setAuCreation(e.target.value)}
                    aria-label="Date de fin (génération des étiquettes)"
                    className="h-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Par défaut : la semaine dernière (lundi → dimanche) — le lot
                  imprimé par le façonnier que vous réceptionnez cette semaine.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="ofs-reception">Numéros d&apos;OF du lot envoyé</Label>
                <Textarea
                  id="ofs-reception"
                  value={ofsCreation}
                  onChange={(e) => setOfsCreation(e.target.value)}
                  placeholder={"078594\n078910\n078955"}
                  className="min-h-20 resize-y font-mono text-sm"
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Un OF par ligne (ou séparés par des virgules) — 50 maximum.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogueCreation(false)}
              disabled={creationEnCours}
            >
              Annuler
            </Button>
            <Button
              onClick={creerReception}
              disabled={creationEnCours}
              className="bg-amber-600 font-semibold text-white hover:bg-amber-700"
            >
              {creationEnCours ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Créer la réception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------- Confirmation de suppression ------------------- */}
      <AlertDialog
        open={confirmationSuppression}
        onOpenChange={setConfirmationSuppression}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette réception ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les lignes attendues et les pointages de «{" "}
              {etat?.reception.titre ?? "cette réception"} » seront supprimés.
              Les étiquettes générées restent en base : vous pourrez recréer la
              réception depuis les mêmes OF ou la même période.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionEnCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void supprimerReception();
              }}
              className="bg-red-600 font-semibold text-white hover:bg-red-700"
            >
              {actionEnCours ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
