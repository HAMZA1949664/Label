"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  BookmarkPlus,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleQuestionMark,
  Copy,
  Eraser,
  FileDown,
  FileArchive,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FileUp,
  Factory,
  FolderDown,
  FolderUp,
  Hash,
  History,
  Keyboard,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  Moon,
  Package,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Sun,
  Tags,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
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
import { Ean13Svg, ean13Valide } from "@/components/ean13-svg";
import { analyserTxtImport, TAILLE_MAX_TXT } from "@/lib/txt-import";
import {
  calculerEtiquette,
  couleurAffichee,
  couleurLabel,
  comparerCouleurs,
  exportTxt,
  mancheLabel,
  speBarcode,
  tailleLabel,
  TYPES,
  type EtiquetteCalculee,
  type RecordRef,
} from "@/lib/label-data";
import { trierTailles } from "@/lib/tailles";
import { ColisageWorkspace } from "@/components/colisage-workspace";
import { CloudPanel } from "@/components/cloud-panel";
import {
  BadgeCompte,
  CompteGarde,
  useCompte,
} from "@/components/compte-garde";
import { MAX_ETIQUETTES } from "@/lib/nlbl/validation";

interface FileHistorique {
  id: string;
  kind: string;
  filename: string;
  labelsCount: number;
  createdAt: string;
  /** Modèle (ou liste des modèles d'un lot) extrait du détail journalisé. */
  modele?: string;
  /** N° d'OF (ou liste) extrait du détail journalisé. */
  of?: string;
  /** Vrai si les 7 variables sont journalisées → régénération possible. */
  regenerable?: boolean;
  /** Étiquettes complètes du lot (fournies par l'API si regenerable). */
  etiquettes?: EtiquetteCalculee[];
}

interface FileAttenteItem {
  id: string;
  etiquette: EtiquetteCalculee;
  ref: string;
  /** Copies à imprimer de cette étiquette (1-99). */
  quantite: number;
}

/** Groupe de lot mémorisé localement (préset rechargeable de la file d'impression). */
interface LotSauvegarde {
  id: string;
  nom: string;
  /** Date de mémorisation (ISO). */
  date: string;
  /** Lignes figées : étiquette calculée + quantité (indépendant du catalogue). */
  lignes: Array<{ etiquette: EtiquetteCalculee; quantite: number }>;
}

/** Fichier de sauvegarde du journal sélectionné, en attente de confirmation. */
interface RestaurationEnAttente {
  nomFichier: string;
  entrees: unknown[];
}

/** Période du journal : préréglages serveur ou plage de dates personnalisée. */
type PeriodeHisto = "tout" | "aujourdhui" | "7j" | "30j" | "personnalisee";

interface JourStat {
  jour: string;
  libelle: string;
  txt: number;
  nlbl: number;
  etiquettes: number;
}

interface StatsApi {
  /** Période réellement renvoyée (7, 14 ou 30 jours). */
  jours: number;
  totalTxt: number;
  totalNlbl: number;
  totalEtiquettes: number;
  semaineTxt: number;
  semaineNlbl: number;
  semaineEtiquettes: number;
  parJour: JourStat[];
  /** Classement des modèles les plus générés sur la période (max 5). */
  topModeles: Array<{
    modele: string;
    fichiers: number;
    etiquettes: number;
  }>;
}

/** Préférences d'imprimante mémorisées localement (dialog engrenage). */
interface PrefsImprimante {
  /** Personnalisation activée (sinon imprimante du modèle conservée). */
  active: boolean;
  /** Nom exact de l'imprimante Windows (ex. ZDesigner GK420d). */
  nom: string;
  /** Résolution d'impression, à titre de rappel. */
  dpi: string;
}

/** Aperçu structuré du contenu d'un .NLBL (API /api/nlbl/preview). */
interface ApercuNlblApi {
  nomInterne: string;
  entrees: string[];
  chiffrement: string;
  imprimante: string;
  variables: Array<{ nom: string; valeur: string }>;
  xmlSolution: string;
  tailleOctets: number;
}

/** Carte animée à l'apparition (entrées douces en cascade). */
function CarteAnimee({
  children,
  delai = 0,
}: {
  children: React.ReactNode;
  delai?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delai, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

/** Compteur numérique animé (compte progressif, format fr-FR, easing cubique). */
function CompteurAnime({
  valeur,
  decimales = 0,
}: {
  valeur: number;
  decimales?: number;
}) {
  const [affiche, setAffiche] = useState(0);
  const afficheRef = useRef(0);
  useEffect(() => {
    const de = afficheRef.current;
    if (de === valeur) return;
    const debut = performance.now();
    const duree = 650;
    let raf = 0;
    const pas = (t: number) => {
      const p = Math.min(1, (t - debut) / duree);
      const e = 1 - Math.pow(1 - p, 3); // sortie cubique : démarre vite, finit doucement
      const v = de + (valeur - de) * e;
      afficheRef.current = v;
      setAffiche(v);
      if (p < 1) raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(raf);
  }, [valeur]);
  return (
    <>
      {affiche.toLocaleString("fr-FR", {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      })}
    </>
  );
}

/** Télécharge un blob côté navigateur. */
function telecharger(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Nombre maximum d'articles épinglés en favoris. */
const MAX_FAVORIS = 8;

/** Jour calendaire courant en Europe/Paris, au format AAAA-MM-JJ. */
function jourParis(): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Décale un jour « AAAA-MM-JJ » de n jours vers le passé (calcul calendaire UTC). */
function jourMoins(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Clé localStorage des articles favoris (épinglés en tête de liste). */
const CLE_FAVORIS = "clement-articles-favoris";

/**
 * Classes des chips de filtre du journal (type et période) — style homogène,
 * actif ambre, anneau de focus visible pour la navigation clavier.
 */
function classesChipFiltre(actif: boolean): string {
  return `rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-1 ${
    actif
      ? "border-amber-500 bg-amber-100 font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
      : "border-zinc-200 bg-white text-zinc-600 hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-amber-950/40"
  }`;
}

/** Clé localStorage des groupes de lot mémorisés (présets de file d'impression). */
const CLE_LOTS = "clement-lots-sauvegardes";

/** Nombre maximum de groupes de lot mémorisés. */
const MAX_LOTS = 10;

export default function GenerateurEtiquettes() {
  return (
    <CompteGarde>
      <ApplicationEtiquettes />
    </CompteGarde>
  );
}

/**
 * Application principale — montée après la garde de connexion : si des comptes
 * existent (cloud.config.json), l'écran de connexion s'affiche à la place.
 */
function ApplicationEtiquettes() {
  const { authActive, compte } = useCompte();
  /** Compte façonnier (Archipel / Nastex) : génération d'étiquettes uniquement. */
  const estFaconnier = authActive && compte?.role === "faconnier";
  const { toast } = useToast();

  // ----- Catalogue -----
  const [records, setRecords] = useState<RecordRef[]>([]);
  const [chargementCatalogue, setChargementCatalogue] = useState(true);
  const [erreurCatalogue, setErreurCatalogue] = useState<string | null>(null);

  // ----- Sélection courante -----
  const [article, setArticle] = useState("");
  const [couleur, setCouleur] = useState("");
  const [manche, setManche] = useState("");
  const [taille, setTaille] = useState("");
  const [of, setOf] = useState("");
  const [typeValue, setTypeValue] = useState("");
  const [spe, setSpe] = useState(false);
  const [articleOuvert, setArticleOuvert] = useState(false);

  // ----- Génération / file / historique -----
  const [generationEnCours, setGenerationEnCours] = useState(false);
  const [lotEnCours, setLotEnCours] = useState(false);
  const [fileAttente, setFileAttente] = useState<FileAttenteItem[]>([]);
  const [historique, setHistorique] = useState<FileHistorique[]>([]);
  const [stats, setStats] = useState<StatsApi | null>(null);
  const [articlesRecents, setArticlesRecents] = useState<string[]>([]);
  const [articlesFavoris, setArticlesFavoris] = useState<string[]>([]);
  const [ofsRecents, setOfsRecents] = useState<string[]>([]);
  const [valeursCopiees, setValeursCopiees] = useState(false);

  // Pagination du journal + période des statistiques
  const [historiquePage, setHistoriquePage] = useState(0);
  const [historiqueEncore, setHistoriqueEncore] = useState(false);
  const [historiqueTotal, setHistoriqueTotal] = useState(0);
  const [chargerPlusEnCours, setChargerPlusEnCours] = useState(false);
  const [periodeStats, setPeriodeStats] = useState("7");

  // Période du journal (filtre serveur) : préréglages ou dates personnalisées
  const [periodeHisto, setPeriodeHisto] = useState<PeriodeHisto>("tout");
  const [dateDebutHisto, setDateDebutHisto] = useState("");
  const [dateFinHisto, setDateFinHisto] = useState("");

  // Filtre de recherche du journal + état export CSV + aperçu agrandi
  const [rechercheHisto, setRechercheHisto] = useState("");
  const [csvEnCours, setCsvEnCours] = useState(false);
  const [apercuGrand, setApercuGrand] = useState(false);
  const compteurRef = useRef(0);

  // Suppression d'une entrée du journal (confirmation) + thème clair/sombre
  const [suppressionCible, setSuppressionCible] = useState<FileHistorique | null>(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [themeMonte, setThemeMonte] = useState(false);
  useEffect(() => setThemeMonte(true), []);
  /** Thème sombre actif (une fois le composant monté) — colore le graphique. */
  const themeSombre = themeMonte && resolvedTheme === "dark";

  // Préférences d'imprimante + dialogs (imprimante, aide, contenu du fichier)
  const [prefsImprimante, setPrefsImprimante] = useState<PrefsImprimante>({
    active: false,
    nom: "",
    dpi: "203",
  });
  const [dialogImprimante, setDialogImprimante] = useState(false);
  const [dialogAide, setDialogAide] = useState(false);
  const [apercuFichier, setApercuFichier] = useState<ApercuNlblApi | null>(null);
  const [apercuFichierEnCours, setApercuFichierEnCours] = useState(false);
  const [dialogApercuFichier, setDialogApercuFichier] = useState(false);
  const [filtreTypeHisto, setFiltreTypeHisto] = useState<"TOUS" | "NLBL" | "TXT">("TOUS");

  // Recherche avancée dans le catalogue (dialog multi-critères)
  const [dialogRecherche, setDialogRecherche] = useState(false);
  const [rechTexte, setRechTexte] = useState("");
  const [rechCouleur, setRechCouleur] = useState("");
  const [rechManche, setRechManche] = useState("");
  const [rechTaille, setRechTaille] = useState("");

  // Purge complète du journal + skeletons de chargement (historique / stats)
  const [purgeOuverte, setPurgeOuverte] = useState(false);
  const [purgeEnCours, setPurgeEnCours] = useState(false);
  const [chargementHisto, setChargementHisto] = useState(true);
  const [chargementStats, setChargementStats] = useState(true);

  // Groupes de lot mémorisés (présets rechargeables de la file d'impression)
  const [lotsSauvegardes, setLotsSauvegardes] = useState<LotSauvegarde[]>([]);
  const [dialogLot, setDialogLot] = useState(false);
  const [nomLot, setNomLot] = useState("");
  /** Lot à charger alors que la file contient déjà des lignes (confirmation). */
  const [lotACharger, setLotACharger] = useState<LotSauvegarde | null>(null);

  // Scan douchette (code-barres EAN-13 scanné → ajout direct à la file)
  const [codeScan, setCodeScan] = useState("");
  const [scanReussi, setScanReussi] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const temporisationScan = useRef<number | null>(null);

  // Import d'un fichier .TXT historique dans la file d'impression
  const fichierTxtRef = useRef<HTMLInputElement>(null);
  // Glisser-déposer d'un fichier .TXT sur la carte « File d'impression »
  const [depotTxtActif, setDepotTxtActif] = useState(false);
  /** Compteur d'entrées/sorties du glisser (dragenter/dragleave imbriqués). */
  const compteurDepotRef = useRef(0);
  /** Ligne de file momentanément mise en évidence (clic depuis l'aperçu). */
  const [ligneEclat, setLigneEclat] = useState<string | null>(null);
  const temporisationEclat = useRef<number | null>(null);
  // Nettoyage de la temporisation d'éclat de ligne (au démontage)
  useEffect(
    () => () => {
      if (temporisationEclat.current) window.clearTimeout(temporisationEclat.current);
    },
    []
  );

  // Sauvegarde / restauration du journal (fichiers JSON)
  const [sauvegardeJsonEnCours, setSauvegardeJsonEnCours] = useState(false);
  const [restaurationEnAttente, setRestaurationEnAttente] =
    useState<RestaurationEnAttente | null>(null);
  const [restaurationEnCours, setRestaurationEnCours] = useState(false);
  const fichierRestaurationRef = useRef<HTMLInputElement>(null);

  // Espace de travail actif : étiquettes (génération) ou colisage (scans)
  // Les deux vues restent montées (masquées en CSS) : aucune perte d'état
  // (formulaire en cours, codes collés) quand on bascule de l'une à l'autre.
  const [vue, setVue] = useState<"etiquettes" | "colisage">("etiquettes");

  // Un compte façonnier n'a pas accès à l'espace Colisage (réception gérée par
  // la France) : on ramène silencieusement son interface sur « Étiquettes ».
  useEffect(() => {
    if (estFaconnier && vue === "colisage") setVue("etiquettes");
  }, [estFaconnier, vue]);

  // -------------------------------------------------------------------------
  // Chargement du catalogue
  // -------------------------------------------------------------------------
  const chargerCatalogue = useCallback(async () => {
    setChargementCatalogue(true);
    setErreurCatalogue(null);
    try {
      const res = await fetch("/api/articles", { cache: "no-store" });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setRecords(data.records ?? []);
    } catch (e) {
      setErreurCatalogue(
        e instanceof Error ? e.message : "Chargement du catalogue impossible."
      );
    } finally {
      setChargementCatalogue(false);
    }
  }, []);

  const chargerHistorique = useCallback(async (page = 0) => {
    // Skeleton uniquement au premier chargement (pas de flash lors des
    // rafraîchissements après une génération ou une suppression)
    if (page === 0) setChargementHisto(true);
    try {
      // La période sélectionnée (filtre serveur) est lue depuis une ref :
      // chargerHistorique reste stable et respecte toujours le filtre actif.
      const periode = paramsPeriodeRef.current;
      const res = await fetch(
        `/api/generations?page=${page}${periode ? `&${periode}` : ""}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      setHistorique((precedent) =>
        page === 0 ? (data.items ?? []) : [...precedent, ...(data.items ?? [])]
      );
      setHistoriquePage(page);
      setHistoriqueEncore(!!data.encore);
      setHistoriqueTotal(Number(data.total ?? 0));
    } catch {
      // silencieux : l'historique ne doit pas bloquer l'utilisateur
    } finally {
      if (page === 0) setChargementHisto(false);
    }
  }, []);

  /** Charge la page suivante du journal (ajout à la liste affichée). */
  const chargerPlusHistorique = useCallback(async () => {
    setChargerPlusEnCours(true);
    try {
      await chargerHistorique(historiquePage + 1);
    } finally {
      setChargerPlusEnCours(false);
    }
  }, [chargerHistorique, historiquePage]);

  const chargerStats = useCallback(async (jours = 7) => {
    setChargementStats(true);
    try {
      const res = await fetch(`/api/stats?jours=${jours}`, { cache: "no-store" });
      if (!res.ok) return;
      setStats(await res.json());
    } catch {
      // silencieux : les statistiques ne doivent pas bloquer l'utilisateur
    } finally {
      setChargementStats(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Période du journal : préréglages et plage personnalisée (filtre serveur)
  // -----------------------------------------------------------------------
  /** Ref lue par chargerHistorique (stable) pour respecter le filtre actif. */
  const paramsPeriodeRef = useRef("");

  /**
   * Construit la chaîne de requête de la période sélectionnée
   * (« depuis=…&jusqua=… » ou « »). Les préréglages sont calculés en jours
   * calendaires Europe/Paris ; la plage personnalisée n'envoie que les dates
   * complètes (les deux bornes sont facultatives).
   */
  const calculerParamsPeriode = useCallback((): string => {
    const aujourdhui = jourParis();
    let depuis = "";
    let jusqua = "";
    if (periodeHisto === "aujourdhui") {
      depuis = aujourdhui;
      jusqua = aujourdhui;
    } else if (periodeHisto === "7j" || periodeHisto === "30j") {
      depuis = jourMoins(aujourdhui, periodeHisto === "7j" ? 6 : 29);
      jusqua = aujourdhui;
    } else if (periodeHisto === "personnalisee") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateDebutHisto)) depuis = dateDebutHisto;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateFinHisto)) jusqua = dateFinHisto;
    }
    const p = new URLSearchParams();
    if (depuis) p.set("depuis", depuis);
    if (jusqua) p.set("jusqua", jusqua);
    return p.toString();
  }, [periodeHisto, dateDebutHisto, dateFinHisto]);

  /** Requête de période courante (« depuis=…&jusqua=… » ou « »). */
  const periodeQuery = useMemo(calculerParamsPeriode, [calculerParamsPeriode]);

  /** Vrai si un filtre de période est effectivement envoyé au serveur. */
  const periodeActive = periodeQuery !== "";

  /** Plage personnalisée incohérente (début postérieur à la fin). */
  const plageInvalide =
    periodeHisto === "personnalisee" &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateDebutHisto) &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateFinHisto) &&
    dateDebutHisto > dateFinHisto;

  // Recharge le journal au montage et à chaque changement de période
  useEffect(() => {
    paramsPeriodeRef.current = periodeQuery;
    if (plageInvalide) {
      // Plage incohérente : on vide l'affichage (un avertissement est rendu
      // sous le sélecteur) au lieu de laisser une liste obsolète.
      setHistorique([]);
      setHistoriqueEncore(false);
      setHistoriqueTotal(0);
      return;
    }
    chargerHistorique();
  }, [periodeQuery, plageInvalide, chargerHistorique]);

  // Préférences mémorisées localement : favoris, articles récents, derniers OF, type par défaut, imprimante
  useEffect(() => {
    try {
      setArticlesFavoris(JSON.parse(localStorage.getItem(CLE_FAVORIS) ?? "[]"));
      setArticlesRecents(JSON.parse(localStorage.getItem("clement-articles-recents") ?? "[]"));
      setOfsRecents(JSON.parse(localStorage.getItem("clement-ofs-recents") ?? "[]"));
      const lots = JSON.parse(localStorage.getItem(CLE_LOTS) ?? "[]");
      if (Array.isArray(lots)) setLotsSauvegardes(lots as LotSauvegarde[]);
      const typeMemoire = localStorage.getItem("clement-type-defaut");
      if (typeMemoire && TYPES.some((t) => t.value === typeMemoire)) {
        setTypeValue(typeMemoire);
      }
      const prefs = JSON.parse(
        localStorage.getItem("clement-imprimante") ?? "null"
      ) as Partial<PrefsImprimante> | null;
      if (prefs && typeof prefs.active === "boolean") {
        setPrefsImprimante({
          active: prefs.active,
          nom: typeof prefs.nom === "string" ? prefs.nom : "",
          dpi: prefs.dpi === "300" || prefs.dpi === "600" ? prefs.dpi : "203",
        });
      }
    } catch {
      setArticlesFavoris([]);
      setArticlesRecents([]);
      setOfsRecents([]);
      setLotsSauvegardes([]);
    }
  }, []);

  useEffect(() => {
    chargerCatalogue();
    chargerStats();
  }, [chargerCatalogue, chargerStats]);

  // -------------------------------------------------------------------------
  // Listes dérivées (alimentées par le stock en base — jamais codées en dur)
  // -------------------------------------------------------------------------
  const articles = useMemo(
    () => [...new Set(records.map((r) => r[0]))].sort(),
    [records]
  );

  // Couleurs : triées par libellé FR ; en mode SPE, TOUTES les couleurs du stock
  // sont proposées (une nouvelle couleur ajoutée en base apparaît automatiquement).
  const couleursList = useMemo(() => {
    if (!article) return [];
    const codes = spe
      ? records.map((r) => r[1]) // mode SPE : tout le stock
      : records.filter((r) => r[0] === article).map((r) => r[1]);
    return [...new Set(codes)].sort(comparerCouleurs);
  }, [records, article, spe]);

  const manchesList = useMemo(() => {
    if (!article || !couleur) return [];
    return [
      ...new Set(
        records
          .filter((r) => r[0] === article && r[1] === couleur && r[3])
          .map((r) => r[3])
      ),
    ];
  }, [records, article, couleur]);

  const mancheApplicable = spe ? true : manchesList.length > 0;

  const toutesTailles = useMemo(
    () => trierTailles(new Set(records.map((r) => r[2]))),
    [records]
  );

  // Catalogue complet pour la recherche avancée (toutes les couleurs / manches)
  const toutesCouleurs = useMemo(
    () => [...new Set(records.map((r) => r[1]))].sort(comparerCouleurs),
    [records]
  );
  const tousManches = useMemo(
    () => [...new Set(records.map((r) => r[3]).filter(Boolean))].sort(),
    [records]
  );

  const taillesList = useMemo(() => {
    if (!article || !couleur) return [];
    if (spe) return toutesTailles; // mode SPE : taille libre — grille triée du stock
    if (mancheApplicable && manche) {
      return trierTailles(
        new Set(
          records
            .filter((r) => r[0] === article && r[1] === couleur && r[3] === manche)
            .map((r) => r[2])
        )
      );
    }
    if (mancheApplicable) return [];
    return trierTailles(
      new Set(
        records.filter((r) => r[0] === article && r[1] === couleur).map((r) => r[2])
      )
    );
  }, [records, article, couleur, manche, mancheApplicable, spe, toutesTailles]);

  // ----- Enregistrement courant (réel ou synthétique en mode SPE) -----
  const record = useMemo<RecordRef | null>(() => {
    if (spe) {
      if (!article || !couleur || !taille) return null;
      const code = speBarcode(article, couleur, manche, taille, of.trim());
      return [article, couleur, taille, manche, code];
    }
    if (!article || !couleur || !taille) return null;
    if (mancheApplicable && !manche) return null;
    return (
      records.find(
        (r) =>
          r[0] === article &&
          r[1] === couleur &&
          r[2] === taille &&
          (!mancheApplicable || r[3] === manche)
      ) ?? null
    );
  }, [records, article, couleur, taille, manche, mancheApplicable, spe, of]);

  const etiquette = useMemo(
    () => calculerEtiquette({ record, of, typeValue, spe }),
    [record, of, typeValue, spe]
  );

  const peutGenerer =
    !!etiquette && of.trim().length > 0 && ean13Valide(etiquette.codeBarre);

  /** Imprimante cible intégrée aux .NLBL (null = valeur du modèle conservée). */
  const imprimanteCible =
    prefsImprimante.active && prefsImprimante.nom.trim()
      ? prefsImprimante.nom.trim()
      : null;

  // ----- Champs manquants (aide contextuelle) -----
  const champsManquants = useMemo(() => {
    const manquants: string[] = [];
    if (!article) manquants.push("article");
    if (!couleur) manquants.push("couleur");
    if (mancheApplicable && !manche && !spe) manquants.push("manche");
    if (!taille) manquants.push("taille");
    if (!of.trim()) manquants.push("n° d'OF");
    if (!typeValue) manquants.push("type de produit");
    return manquants;
  }, [article, couleur, manche, mancheApplicable, taille, of, typeValue, spe]);

  // Journal filtré par type (.NLBL/.TXT) et par la recherche locale
  // (nom de fichier, type, modèle ou n° d'OF)
  const historiqueFiltre = useMemo(() => {
    const q = rechercheHisto.trim().toLowerCase();
    return historique.filter((h) => {
      if (filtreTypeHisto !== "TOUS" && h.kind !== filtreTypeHisto) return false;
      if (!q) return true;
      return (
        h.filename.toLowerCase().includes(q) ||
        h.kind.toLowerCase().includes(q) ||
        (h.modele ?? "").toLowerCase().includes(q) ||
        (h.of ?? "").toLowerCase().includes(q)
      );
    });
  }, [historique, rechercheHisto, filtreTypeHisto]);

  // ----- Statistiques dérivées : meilleur jour + jours actifs de la période -----
  /** Jour avec le plus d'étiquettes générées (départage : fichiers, puis date). */
  const meilleurJourStats = useMemo(() => {
    if (!stats || stats.parJour.length === 0) return null;
    return [...stats.parJour].sort(
      (a, b) =>
        b.etiquettes - a.etiquettes ||
        b.nlbl + b.txt - (a.nlbl + a.txt) ||
        a.jour.localeCompare(b.jour)
    )[0];
  }, [stats]);

  /** Nombre de jours de la période ayant au moins un fichier généré. */
  const joursActifs = useMemo(
    () =>
      stats ? stats.parJour.filter((j) => j.nlbl + j.txt > 0).length : 0,
    [stats]
  );

  // -----------------------------------------------------------------------
  // Recherche avancée du catalogue (dialog multi-critères, filtrage local
  // sur les 4 623 références déjà chargées — instantané, sans appel API)
  // -----------------------------------------------------------------------
  const resultatsRecherche = useMemo(() => {
    const q = rechTexte.trim().toLowerCase();
    return records.filter((r) => {
      if (rechCouleur && r[1] !== rechCouleur) return false;
      if (rechManche && r[3] !== rechManche) return false;
      if (rechTaille && r[2] !== rechTaille) return false;
      if (!q) return true;
      return r[0].toLowerCase().includes(q) || r[4].includes(q);
    });
  }, [records, rechTexte, rechCouleur, rechManche, rechTaille]);

  /** Résultats affichés (plafond : 50 lignes pour garder un rendu fluide). */
  const MAX_RESULTATS_RECHERCHE = 50;
  const resultatsAffiches = useMemo(
    () => resultatsRecherche.slice(0, MAX_RESULTATS_RECHERCHE),
    [resultatsRecherche]
  );

  /** Ouvre la recherche avancée avec des critères vierges. */
  const ouvrirRecherche = () => {
    setRechTexte("");
    setRechCouleur("");
    setRechManche("");
    setRechTaille("");
    setDialogRecherche(true);
  };

  /** Applique une référence trouvée : remplit tout le formulaire en cascade. */
  const appliquerResultatRecherche = (r: RecordRef) => {
    setDialogRecherche(false);
    choisirArticle(r[0]); // réinitialise couleur/manche/taille…
    setCouleur(r[1]); // …puis les valeurs de la référence (états groupés)
    setManche(r[3] ?? "");
    setTaille(r[2]);
  };

  // -------------------------------------------------------------------------
  // Handlers de sélection (réinitialisations en cascade)
  // -------------------------------------------------------------------------
  const choisirArticle = (v: string) => {
    setArticle(v);
    setArticleOuvert(false);
    setCouleur("");
    setManche("");
    setTaille("");
    // Mémorise l'article dans les récents (max 4, dédoublonné)
    setArticlesRecents((prev) => {
      const suivant = [v, ...prev.filter((x) => x !== v)].slice(0, 4);
      try {
        localStorage.setItem("clement-articles-recents", JSON.stringify(suivant));
      } catch {
        // stockage indisponible : sans conséquence
      }
      return suivant;
    });
  };
  const choisirCouleur = (v: string) => {
    setCouleur(v);
    setManche("");
    setTaille("");
  };
  const changerSpe = (v: boolean) => {
    setSpe(v);
    setManche("");
    setTaille("");
    // Retour au mode FAB : la couleur doit appartenir à l'article sélectionné
    // (en mode SPE elle pouvait venir de tout le stock)
    if (!v) setCouleur("");
  };

  /** Mémorise les n° d'OF utilisés (max 3, dédoublonnés) pour les proposer en chips. */
  const memoriserOfs = useCallback((ofs: string[]) => {
    const valides = [...new Set(ofs.map((o) => o.trim()).filter(Boolean))];
    if (valides.length === 0) return;
    setOfsRecents((prev) => {
      const suivant = [...new Set([...valides, ...prev])].slice(0, 3);
      try {
        localStorage.setItem("clement-ofs-recents", JSON.stringify(suivant));
      } catch {
        // stockage indisponible : sans conséquence
      }
      return suivant;
    });
  }, []);

  /** Sélectionne un type et le mémorise comme choix par défaut. */
  const choisirType = (v: string) => {
    setTypeValue(v);
    try {
      localStorage.setItem("clement-type-defaut", v);
    } catch {
      // stockage indisponible : sans conséquence
    }
  };

  /** Épingle (ou retire) un article des favoris — max 8, mémorisé localement. */
  const basculerFavori = (a: string) => {
    setArticlesFavoris((prev) => {
      const dejaFavori = prev.includes(a);
      if (!dejaFavori && prev.length >= MAX_FAVORIS) {
        toast({
          title: "Maximum de favoris atteint",
          description: `Vous pouvez épingler au plus ${MAX_FAVORIS} articles. Retirez-en un pour faire de la place.`,
        });
        return prev;
      }
      const suivant = dejaFavori
        ? prev.filter((x) => x !== a)
        : [a, ...prev];
      try {
        localStorage.setItem(CLE_FAVORIS, JSON.stringify(suivant));
      } catch {
        // stockage indisponible : sans conséquence
      }
      return suivant;
    });
  };

  /** Supprime définitivement l'entrée ciblée du journal (après confirmation). */
  const supprimerEntreeJournal = useCallback(async () => {
    if (!suppressionCible) return;
    setSuppressionEnCours(true);
    try {
      const res = await fetch(`/api/generations/${suppressionCible.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? `Le serveur a renvoyé une erreur (${res.status}).`
        );
      }
      toast({
        title: "Entrée supprimée du journal",
        description: `${suppressionCible.filename} n'apparaît plus dans l'historique (les fichiers déjà téléchargés ne sont pas affectés).`,
      });
      setSuppressionCible(null);
      await Promise.all([chargerHistorique(), chargerStats(Number(periodeStats))]);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Suppression impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue.",
      });
    } finally {
      setSuppressionEnCours(false);
    }
  }, [suppressionCible, toast, chargerHistorique, chargerStats, periodeStats]);

  /** Vide tout le journal (API DELETE /api/generations) après confirmation. */
  const purgerJournal = useCallback(async () => {
    setPurgeEnCours(true);
    try {
      const res = await fetch("/api/generations", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? `Le serveur a renvoyé une erreur (${res.status}).`
        );
      }
      const data = (await res.json()) as { supprimees?: number };
      toast({
        title: "Journal vidé",
        description: `${(data.supprimees ?? 0).toLocaleString("fr-FR")} entrée(s) supprimée(s) : l'historique et les statistiques repartent de zéro (les fichiers déjà téléchargés ne sont pas affectés).`,
      });
      setPurgeOuverte(false);
      await Promise.all([chargerHistorique(), chargerStats(Number(periodeStats))]);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Purge du journal impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue.",
      });
    } finally {
      setPurgeEnCours(false);
    }
  }, [toast, chargerHistorique, chargerStats, periodeStats]);

  /** Enregistre les préférences d'imprimante (localStorage + toast). */
  const enregistrerPrefsImprimante = () => {
    const prefs: PrefsImprimante = { ...prefsImprimante, nom: prefsImprimante.nom.trim() };
    if (prefs.active && prefs.nom.length === 0) {
      toast({
        variant: "destructive",
        title: "Nom d'imprimante requis",
        description:
          "Saisissez le nom exact de l'imprimante Windows ou désactivez la personnalisation.",
      });
      return;
    }
    try {
      localStorage.setItem("clement-imprimante", JSON.stringify(prefs));
    } catch {
      // stockage indisponible : sans conséquence
    }
    setPrefsImprimante(prefs);
    setDialogImprimante(false);
    toast({
      title: "Préférences enregistrées",
      description: prefs.active
        ? `Imprimante cible intégrée aux .NLBL : ${prefs.nom}${prefs.dpi ? ` (${prefs.dpi} dpi)` : ""}.`
        : "Imprimante du modèle conservée (ZDesigner GK420d).",
    });
  };

  // -----------------------------------------------------------------------
  // Groupes de lot mémorisés (présets rechargeables de la file d'impression)
  // -----------------------------------------------------------------------
  /** Ouvre le dialog de mémorisation avec un nom par défaut lisible. */
  const ouvrirDialogLot = () => {
    const p = (n: number) => String(n).padStart(2, "0");
    const d = new Date();
    setNomLot(
      `Lot du ${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
    );
    setDialogLot(true);
  };

  /** Mémorise la file courante sous le nom saisi (max 10 lots, localStorage). */
  const memoriserLot = () => {
    const nom = nomLot.trim().slice(0, 40);
    if (!nom) {
      toast({
        variant: "destructive",
        title: "Nom du lot requis",
        description: "Donnez un nom au lot pour le retrouver plus tard.",
      });
      return;
    }
    const lot: LotSauvegarde = {
      id: `lot-${Date.now()}`,
      nom,
      date: new Date().toISOString(),
      lignes: fileAttente.map((f) => ({
        etiquette: f.etiquette,
        quantite: f.quantite,
      })),
    };
    const suivants = [lot, ...lotsSauvegardes].slice(0, MAX_LOTS);
    try {
      localStorage.setItem(CLE_LOTS, JSON.stringify(suivants));
    } catch {
      // stockage indisponible : sans conséquence
    }
    setLotsSauvegardes(suivants);
    setDialogLot(false);
    toast({
      title: "Lot mémorisé",
      description: `« ${nom} » — ${fileAttente.length} étiquette${fileAttente.length > 1 ? "s" : ""}, ${totalCopiesFile} copie${totalCopiesFile > 1 ? "s" : ""}. Rechargez-le en un clic depuis la file d'impression.`,
    });
  };

  /** Remplace la file par les lignes du lot mémorisé (quantités conservées). */
  const appliquerLot = (lot: LotSauvegarde) => {
    const lignes = lot.lignes.slice(0, MAX_ETIQUETTES);
    setFileAttente(
      lignes.map((l, i) => ({
        id: `q-${Date.now()}-${i}`,
        etiquette: l.etiquette,
        ref: `${l.etiquette.modele} · ${l.etiquette.couleur} · ${l.etiquette.taille} · OF ${l.etiquette.of}`,
        quantite: Math.min(99, Math.max(1, Math.trunc(l.quantite) || 1)),
      }))
    );
    toast({
      title: "Lot chargé",
      description: `« ${lot.nom} » — ${lignes.length} ligne${lignes.length > 1 ? "s" : ""} dans la file (quantités conservées).`,
    });
  };

  /** Charge un lot : confirmation de remplacement si la file n'est pas vide. */
  const chargerLot = (lot: LotSauvegarde) => {
    if (fileAttente.length > 0) {
      setLotACharger(lot);
      return;
    }
    appliquerLot(lot);
  };

  /** Supprime un groupe mémorisé (les fichiers déjà générés ne sont pas affectés). */
  const supprimerLot = (id: string) => {
    const suivant = lotsSauvegardes.filter((l) => l.id !== id);
    try {
      localStorage.setItem(CLE_LOTS, JSON.stringify(suivant));
    } catch {
      // stockage indisponible : sans conséquence
    }
    setLotsSauvegardes(suivant);
    toast({
      title: "Lot retiré",
      description:
        "Le groupe mémorisé a été supprimé (les fichiers déjà générés ne sont pas affectés).",
    });
  };

  /** Récupère la structure du .NLBL courant sans le télécharger (vérification). */
  const chargerApercuFichier = useCallback(async () => {
    if (!etiquette) return;
    setApercuFichierEnCours(true);
    try {
      const res = await fetch("/api/nlbl/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labels: [etiquette],
          printer: imprimanteCible ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? `Le serveur a renvoyé une erreur (${res.status}).`
        );
      }
      setApercuFichier(await res.json());
      setDialogApercuFichier(true);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Aperçu du fichier impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue.",
      });
    } finally {
      setApercuFichierEnCours(false);
    }
  }, [etiquette, imprimanteCible, toast]);
  const reinitialiser = () => {
    setArticle("");
    setCouleur("");
    setManche("");
    setTaille("");
    setOf("");
    setTypeValue("");
    setSpe(false);
  };

  // -------------------------------------------------------------------------
  // Génération .NLBL / export .TXT / file d'impression
  // -------------------------------------------------------------------------
  const genererNlbl = useCallback(
    async (
      etiquettes: EtiquetteCalculee[],
      enCours: (v: boolean) => void,
      quantites?: number[]
    ) => {
      enCours(true);
      try {
        const res = await fetch("/api/nlbl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            labels: etiquettes,
            printer: imprimanteCible ?? undefined,
            quantites: quantites ?? undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(
            data?.error ?? `Le serveur a renvoyé une erreur (${res.status}).`
          );
        }
        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const filename =
          /filename="([^"]+)"/.exec(disposition)?.[1] ?? "etiquettes.nlbl";
        const count = Number(res.headers.get("X-Label-Count") ?? etiquettes.length);
        const mode = res.headers.get("X-Label-Mode") ?? "nlbl";

        telecharger(blob, filename);
        memoriserOfs(etiquettes.map((e) => e.of));
        const copies = Number(res.headers.get("X-Label-Copies") ?? count);
        toast({
          title: "Fichier .NLBL généré",
          description:
            mode === "zip"
              ? `${filename} — ${count} fichier${count > 1 ? "s" : ""} .nlbl, ${copies} copies à imprimer (quantités dans le LISEZMOI).`
              : `${filename} — ${count} étiquette${count > 1 ? "s" : ""}${copies > 1 ? ` ×${copies}` : ""}. Ouvrez-le dans Zebra Designer : les données sont déjà intégrées.`,
        });
        chargerHistorique();
        chargerStats(Number(periodeStats));
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Échec de la génération .NLBL",
          description: e instanceof Error ? e.message : "Erreur inconnue.",
        });
      } finally {
        enCours(false);
      }
    },
    [toast, chargerHistorique, chargerStats, memoriserOfs, imprimanteCible, periodeStats]
  );

  // Raccourci clavier : Ctrl/⌘ + Entrée → générer le fichier .NLBL courant
  const estMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);
  useEffect(() => {
    const gestionnaire = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (peutGenerer && !generationEnCours && etiquette) {
          genererNlbl([etiquette], setGenerationEnCours);
        }
      }
    };
    window.addEventListener("keydown", gestionnaire);
    return () => window.removeEventListener("keydown", gestionnaire);
  }, [peutGenerer, generationEnCours, etiquette, genererNlbl]);

  // Raccourcis clavier : Ctrl/⌘ + K → recherche avancée ; Ctrl/⌘ + M → file d'impression
  useEffect(() => {
    const gestionnaire = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      // N'intercepte pas les raccourcis lorsqu'un dialog est déjà ouvert
      if (
        dialogRecherche ||
        dialogAide ||
        dialogImprimante ||
        dialogApercuFichier ||
        apercuGrand ||
        suppressionCible ||
        purgeOuverte ||
        dialogLot ||
        lotACharger ||
        restaurationEnAttente
      )
        return;
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        ouvrirRecherche();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        if (peutGenerer) ajouterALaFile();
      }
    };
    window.addEventListener("keydown", gestionnaire);
    return () => window.removeEventListener("keydown", gestionnaire);
  }, [
    peutGenerer,
    dialogRecherche,
    dialogAide,
    dialogImprimante,
    dialogApercuFichier,
    apercuGrand,
    suppressionCible,
    purgeOuverte,
    dialogLot,
    lotACharger,
    restaurationEnAttente,
  ]);

  // Copie des 7 variables dans le presse-papiers (format identique à l'export TXT)
  const copierValeurs = useCallback(async () => {
    if (!etiquette) return;
    try {
      await navigator.clipboard.writeText(exportTxt(etiquette));
      setValeursCopiees(true);
      window.setTimeout(() => setValeursCopiees(false), 2000);
      toast({
        title: "Valeurs copiées",
        description: "Les 7 variables sont dans le presse-papiers (format Clé=valeur).",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Copie impossible",
        description: "Le navigateur a refusé l'accès au presse-papiers.",
      });
    }
  }, [etiquette, toast]);

  const exporterTxt = useCallback(() => {
    if (!etiquette) return;
    const content = exportTxt(etiquette);
    const safe = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]+/g, "_");
    const filename = `etiquette_${safe(article)}_${safe(couleur)}_${safe(taille)}_${safe(of)}.txt`;
    telecharger(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
      filename
    );
    // Journalisation (n'empêche pas le téléchargement si elle échoue)
    fetch("/api/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "TXT",
        filename,
        labelsCount: 1,
        details: JSON.stringify({ modele: etiquette.modele, of: etiquette.of }),
      }),
    })
      .then(() => {
        chargerHistorique();
        chargerStats(Number(periodeStats));
      })
      .catch(() => undefined);
    toast({
      title: "Fichier .TXT exporté",
      description: `${filename} — format historique « Charger… » de Zebra Designer conservé.`,
    });
  }, [etiquette, article, couleur, taille, of, toast, chargerHistorique, chargerStats, periodeStats]);

  /**
   * Clé d'identité stricte d'une étiquette (les 7 variables) : deux étiquettes
   * de même clé sont considérées comme des copies à fusionner dans la file.
   */
  const cleEtiquette = useCallback(
    (e: EtiquetteCalculee) =>
      [e.modele, e.type, e.of, e.codeBarre, e.couleur, e.manche, e.taille].join(
        "\u001f"
      ),
    []
  );

  /**
   * Ajoute une étiquette à la file d'impression ; si une ligne STRICTEMENT
   * identique (les 7 variables) y figure déjà, sa quantité est augmentée
   * (fusion) au lieu de dupliquer la ligne — correspond au réflexe naturel
   * « rescanner la même référence = une copie de plus ».
   * Retourne true si la ligne existante a été fusionnée/incrémentée.
   */
  const fusionnerOuAjouter = (etiquette: EtiquetteCalculee): boolean => {
    const cle = cleEtiquette(etiquette);
    const index = fileAttente.findIndex((f) => cleEtiquette(f.etiquette) === cle);
    if (index >= 0) {
      const existante = fileAttente[index];
      if (existante.quantite >= 99) {
        toast({
          title: "Quantité maximale atteinte",
          description: `« ${etiquette.modele} — OF ${etiquette.of} » est déjà à 99 copies (maximum par ligne).`,
        });
        return true;
      }
      const nouvelleQte = existante.quantite + 1;
      setFileAttente((q) =>
        q.map((f, i) => (i === index ? { ...f, quantite: nouvelleQte } : f))
      );
      toast({
        title: "Copie ajoutée à la ligne existante",
        description: `« ${etiquette.modele} — OF ${etiquette.of} » : quantité portée à ${nouvelleQte}.`,
      });
      return true;
    }
    if (fileAttente.length >= MAX_ETIQUETTES) {
      toast({
        variant: "destructive",
        title: "File d'impression pleine",
        description: `Maximum ${MAX_ETIQUETTES} étiquettes par lot.`,
      });
      return false;
    }
    compteurRef.current += 1;
    setFileAttente((q) => [
      ...q,
      {
        id: `q-${Date.now()}-${compteurRef.current}`,
        etiquette,
        ref: `${etiquette.modele} · ${etiquette.couleur} · ${etiquette.taille} · OF ${etiquette.of}`,
        quantite: 1,
      },
    ]);
    return false;
  };

  const ajouterALaFile = () => {
    if (!etiquette) return;
    fusionnerOuAjouter(etiquette);
  };

  // -----------------------------------------------------------------------
  // Scan douchette : un code-barres EAN-13 scanné (ou saisi) ajoute
  // directement l'étiquette correspondante à la file d'impression.
  // -----------------------------------------------------------------------
  useEffect(
    () => () => {
      // Nettoyage du temporisateur de l'indicateur visuel au démontage
      if (temporisationScan.current !== null) {
        window.clearTimeout(temporisationScan.current);
      }
    },
    []
  );

  const traiterScan = (e: React.FormEvent) => {
    e.preventDefault();
    const code = codeScan.trim();
    // Le champ est toujours vidé après lecture : une douchette enchaîne les
    // scans ; le code rejeté reste visible dans le toast d'erreur.
    setCodeScan("");
    if (!code) return;
    scanInputRef.current?.focus();
    if (!/^\d{13}$/.test(code)) {
      toast({
        variant: "destructive",
        title: "Code non reconnu",
        description: `« ${code.slice(0, 20)} » n'est pas un code EAN-13 (13 chiffres attendus).`,
      });
      return;
    }
    if (code.startsWith("99")) {
      toast({
        variant: "destructive",
        title: "Code SPE non scannable",
        description:
          "Les codes SPE (préfixe 99) sont calculés à la volée et n'existent pas dans le catalogue. Complétez le formulaire en mode SPE.",
      });
      return;
    }
    const trouve = records.find((r) => r[4] === code);
    if (!trouve) {
      toast({
        variant: "destructive",
        title: "Référence inconnue",
        description: `Le code ${code} n'existe pas dans le catalogue (${records.length.toLocaleString("fr-FR")} références chargées).`,
      });
      return;
    }
    if (!typeValue) {
      toast({
        variant: "destructive",
        title: "Type de produit requis",
        description:
          "Choisissez d'abord le type de produit (Veste, Tablier…) : il est appliqué à toutes les étiquettes scannées.",
      });
      return;
    }
    if (!of.trim()) {
      toast({
        variant: "destructive",
        title: "N° d'OF requis",
        description:
          "Renseignez d'abord le n° d'OF du formulaire : le même OF est appliqué à tous les scans de la session.",
      });
      return;
    }
    const etiquette = calculerEtiquette({
      record: trouve,
      of,
      typeValue,
      spe: false,
    });
    if (!etiquette) return;
    // Ajout à la file (fusion automatique si la même étiquette y figure déjà)
    fusionnerOuAjouter(etiquette);
    setScanReussi(true);
    if (temporisationScan.current !== null) {
      window.clearTimeout(temporisationScan.current);
    }
    temporisationScan.current = window.setTimeout(() => {
      setScanReussi(false);
      temporisationScan.current = null;
    }, 900);
  };

  // -----------------------------------------------------------------------
  // Import d'un fichier .TXT historique (format Clé=valeur) dans la file :
  // les 7 variables sont reprises telles quelles, sans repasser par le
  // catalogue — les anciens exports redeviennent imprimables en .NLBL.
  // -----------------------------------------------------------------------
  /**
   * Importe un fichier .TXT historique dans la file — partagé entre le
   * bouton « Importer un .TXT » et le glisser-déposer sur la carte.
   */
  const importerFichierTxt = (fichier: File) => {
    const nomBas = fichier.name.toLowerCase();
    if (!nomBas.endsWith(".txt") && fichier.type !== "text/plain") {
      toast({
        variant: "destructive",
        title: "Format non pris en charge",
        description: fichier.name.toLowerCase().endsWith(".json")
          ? "Les sauvegardes du journal passent par « Restaurer une sauvegarde » (bouton en bas de page)."
          : "Déposez un fichier .TXT (ancien export Clé=valeur).",
      });
      return;
    }
    if (fichier.size > TAILLE_MAX_TXT) {
      toast({
        variant: "destructive",
        title: "Fichier trop volumineux",
        description: "Taille maximale acceptée : 1 Mo.",
      });
      return;
    }
    fichier
      .text()
      .then((texte) => {
        const resultat = analyserTxtImport(texte);
        if (resultat.etiquettes.length === 0) {
          toast({
            variant: "destructive",
            title: "Aucune étiquette exploitable",
            description:
              "Format attendu : lignes Clé=valeur (Modele, Type, OF, CodeBarre, Couleur, Manche, Taille) avec un code-barres EAN-13 valide.",
          });
          return;
        }
        const placeRestante = MAX_ETIQUETTES - fileAttente.length;
        if (placeRestante <= 0) {
          toast({
            variant: "destructive",
            title: "File d'impression pleine",
            description: `Maximum ${MAX_ETIQUETTES} étiquettes par lot.`,
          });
          return;
        }
        const ajout = resultat.etiquettes.slice(0, placeRestante);
        compteurRef.current += 1;
        const base = compteurRef.current;
        setFileAttente((q) => [
          ...q,
          ...ajout.map((et, i) => ({
            id: `q-${Date.now()}-${base + i}`,
            etiquette: et,
            ref: `${et.modele} · ${et.couleur} · ${et.taille} · OF ${et.of}`,
            quantite: 1,
          })),
        ]);
        const nonAjoutees =
          resultat.ignorees + (resultat.etiquettes.length - ajout.length);
        toast({
          title: "Fichier .TXT importé",
          description: `${ajout.length} étiquette${ajout.length > 1 ? "s" : ""} ajoutée${ajout.length > 1 ? "s" : ""} à la file${nonAjoutees > 0 ? ` — ${nonAjoutees} ignorée${nonAjoutees > 1 ? "s" : ""} (données invalides${resultat.etiquettes.length - ajout.length > 0 ? " ou file pleine" : ""})` : ""}.`,
        });
      })
      .catch(() => {
        toast({
          variant: "destructive",
          title: "Lecture du fichier impossible",
          description: "Le fichier n'a pas pu être lu (encodage texte attendu).",
        });
      });
  };

  /** Entrée du champ fichier : délègue à l'import partagé. */
  const gestionFichierTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = ""; // permet de re-sélectionner le même fichier ensuite
    if (fichier) importerFichierTxt(fichier);
  };

  // -----------------------------------------------------------------------
  // Glisser-déposer d'un .TXT sur la carte « File d'impression »
  // -----------------------------------------------------------------------
  /** Un fichier est-il en cours de glissement au-dessus de la carte ? */
  const glisserSurCarte = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const entrerDepot = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    compteurDepotRef.current += 1;
    setDepotTxtActif(true);
  };

  const quitterDepot = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    compteurDepotRef.current = Math.max(0, compteurDepotRef.current - 1);
    if (compteurDepotRef.current === 0) setDepotTxtActif(false);
  };

  const deposerFichier = (e: React.DragEvent) => {
    e.preventDefault();
    compteurDepotRef.current = 0;
    setDepotTxtActif(false);
    const fichier = e.dataTransfer.files?.[0];
    if (fichier) importerFichierTxt(fichier);
  };

  /** Fait défiler la ligne de file correspondante et la met en évidence. */
  const revelerLigneFile = (id: string) => {
    document
      .getElementById(`file-ligne-${id}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setLigneEclat(id);
    if (temporisationEclat.current) window.clearTimeout(temporisationEclat.current);
    temporisationEclat.current = window.setTimeout(() => setLigneEclat(null), 1200);
  };

  /** Remet les étiquettes d'une entrée du journal dans la file d'impression. */
  const regenererDepuisJournal = (h: FileHistorique) => {
    if (!h.regenerable || !h.etiquettes || h.etiquettes.length === 0) return;
    const placeRestante = MAX_ETIQUETTES - fileAttente.length;
    if (placeRestante <= 0) {
      toast({
        variant: "destructive",
        title: "File d'impression pleine",
        description: `Maximum ${MAX_ETIQUETTES} étiquettes par lot.`,
      });
      return;
    }
    const ajout = h.etiquettes.slice(0, placeRestante);
    compteurRef.current += 1;
    const base = compteurRef.current;
    setFileAttente((q) => [
      ...q,
      ...ajout.map((et, i) => ({
        id: `q-${Date.now()}-${base + i}`,
        etiquette: et,
        ref: `${et.modele} · ${et.couleur} · ${et.taille} · OF ${et.of}`,
        quantite: 1,
      })),
    ]);
    toast({
      title: "Lot remis dans la file",
      description: `${ajout.length} étiquette${ajout.length > 1 ? "s" : ""} de « ${h.filename} » — vérifiez les quantités, puis régénérez le lot.`,
    });
  };

  /** Ajuste la quantité d'une ligne de la file (1-99). */
  const changerQuantite = (id: string, delta: number) => {
    setFileAttente((q) =>
      q.map((f) =>
        f.id === id
          ? { ...f, quantite: Math.min(99, Math.max(1, f.quantite + delta)) }
          : f
      )
    );
  };

  /** Total de copies à imprimer demandées dans la file. */
  const totalCopiesFile = useMemo(
    () => fileAttente.reduce((s, f) => s + f.quantite, 0),
    [fileAttente]
  );

  /** Taux de remplissage de la file (0-100) pour la barre de progression. */
  const remplissageFile = Math.round((fileAttente.length / MAX_ETIQUETTES) * 100);

  // Export du journal complet au format CSV (colonne Modèle / OF incluses)
  const exporterCsv = useCallback(async () => {
    setCsvEnCours(true);
    try {
      // L'export respecte la période sélectionnée dans le journal (filtre serveur)
      const res = await fetch(
        `/api/generations/export${periodeQuery ? `?${periodeQuery}` : ""}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(`Le serveur a renvoyé une erreur (${res.status}).`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? "journal_generations.csv";
      telecharger(blob, filename);
      toast({
        title: "Journal exporté au format CSV",
        description: `${filename}${periodeActive ? " — période sélectionnée" : ""} — séparateur « ; », accents préservés (Excel).`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Échec de l'export CSV",
        description: e instanceof Error ? e.message : "Erreur inconnue.",
      });
    } finally {
      setCsvEnCours(false);
    }
  }, [toast, periodeQuery, periodeActive]);

  const genererLot = () => {
    if (fileAttente.length === 0) return;
    genererNlbl(
      fileAttente.map((f) => f.etiquette),
      setLotEnCours,
      fileAttente.map((f) => f.quantite)
    );
  };

  // -----------------------------------------------------------------------
  // Sauvegarde / restauration du journal (fichiers JSON)
  // -----------------------------------------------------------------------
  /** Télécharge la sauvegarde JSON complète du journal (API GET). */
  const exporterSauvegarde = useCallback(async () => {
    setSauvegardeJsonEnCours(true);
    try {
      const res = await fetch("/api/generations/backup", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Le serveur a renvoyé une erreur (${res.status}).`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ?? "journal_etiquettes.json";
      telecharger(blob, filename);
      toast({
        title: "Sauvegarde du journal téléchargée",
        description: `${filename} — toutes les entrées sont incluses (restaurable à tout moment).`,
      });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Échec de la sauvegarde",
        description: e instanceof Error ? e.message : "Erreur inconnue.",
      });
    } finally {
      setSauvegardeJsonEnCours(false);
    }
  }, [toast]);

  /** Lit le fichier JSON choisi et prépare la confirmation de restauration. */
  const gestionFichierRestauration = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = ""; // permet de re-sélectionner le même fichier ensuite
    if (!fichier) return;
    fichier
      .text()
      .then((texte) => {
        const data = JSON.parse(texte) as { entrees?: unknown[] };
        if (!data || !Array.isArray(data.entrees) || data.entrees.length === 0) {
          throw new Error("Aucune entrée trouvée dans ce fichier.");
        }
        if (data.entrees.length > 2000) {
          throw new Error(
            `Trop d'entrées (${data.entrees.length.toLocaleString("fr-FR")}) — maximum 2 000 par restauration.`
          );
        }
        setRestaurationEnAttente({ nomFichier: fichier.name, entrees: data.entrees });
      })
      .catch(() => {
        toast({
          variant: "destructive",
          title: "Fichier de sauvegarde invalide",
          description:
            "Le fichier choisi n'est pas une sauvegarde du journal (JSON attendu).",
        });
      });
  };

  /** Confirme la restauration : envoie les entrées à l'API (doublons ignorés). */
  const confirmerRestauration = useCallback(async () => {
    if (!restaurationEnAttente) return;
    setRestaurationEnCours(true);
    try {
      const res = await fetch("/api/generations/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entrees: restaurationEnAttente.entrees }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error ?? `Le serveur a renvoyé une erreur (${res.status}).`
        );
      }
      const data = (await res.json()) as { ajoutees?: number; ignorees?: number };
      toast({
        title: "Journal restauré",
        description: `${(data.ajoutees ?? 0).toLocaleString("fr-FR")} entrée(s) ajoutée(s), ${(data.ignorees ?? 0).toLocaleString("fr-FR")} ignorée(s) (déjà présentes ou invalides).`,
      });
      setRestaurationEnAttente(null);
      await Promise.all([chargerHistorique(), chargerStats(Number(periodeStats))]);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Restauration impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue.",
      });
    } finally {
      setRestaurationEnCours(false);
    }
  }, [restaurationEnAttente, toast, chargerHistorique, chargerStats, periodeStats]);

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen flex-col bg-zinc-100 dark:bg-zinc-950">
      {/* En-tête */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-900/90 text-white shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-zinc-900/75">
        <div className="h-1 w-full bg-gradient-to-r from-amber-700 via-amber-400 to-amber-700" aria-hidden="true" />
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Logo officiel Clément Design (version blanche pour fond sombre) */}
            <img
              src="/logo-clement-blanc.png"
              alt="Clément Design — Le Couturier des Cuisiniers"
              className="h-7 w-auto sm:h-8"
              width={272}
              height={32}
            />
            <div className="hidden border-l border-zinc-700 pl-3 sm:block">
              <h1 className="text-base font-bold leading-tight text-white">
                Étiquettes &amp; colisage
              </h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge
              variant="outline"
              className="border-zinc-700 bg-zinc-800 text-zinc-300"
            >
              {chargementCatalogue
                ? "Catalogue…"
                : `${records.length.toLocaleString("fr-FR")} références`}
            </Badge>
            <Badge className="bg-amber-600 text-white hover:bg-amber-600">
              Zebra Designer Essentials 3
            </Badge>
            <BadgeCompte />
            <CloudPanel />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={
                    themeMonte && resolvedTheme === "dark"
                      ? "Passer en mode clair"
                      : "Passer en mode sombre"
                  }
                  onClick={() =>
                    setTheme(resolvedTheme === "dark" ? "light" : "dark")
                  }
                  className="h-9 w-9 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  {themeMonte && resolvedTheme === "dark" ? (
                    <Sun className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Moon className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {themeMonte && resolvedTheme === "dark"
                    ? "Passer en mode clair"
                    : "Passer en mode sombre"}
                </p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Préférences d'imprimante"
                  onClick={() => setDialogImprimante(true)}
                  className="relative h-9 w-9 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                  {prefsImprimante.active && (
                    <span
                      className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-zinc-900 dark:ring-zinc-950"
                      aria-hidden="true"
                    />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Préférences d&apos;imprimante — cible actuelle :{" "}
                  {imprimanteCible ?? "ZDesigner GK420d"}
                </p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Aide : mode d'emploi"
                  onClick={() => setDialogAide(true)}
                  className="h-9 w-9 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  <CircleQuestionMark className="h-4 w-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Mode d&apos;emploi (impression avec Zebra Designer)</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {/* Bandeau d'accueil façonnier : cadre explicite de l'espace autorisé */}
        {estFaconnier && compte && (
          <Card className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30">
            <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm text-amber-900 dark:text-amber-300">
              <Factory className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong className="font-semibold">Espace façonnier — {compte.siteLabel}.</strong>{" "}
                Vous générez et imprimez les étiquettes ; chaque production est
                enregistrée à votre nom dans la base partagée. La réception et le
                colisage sont réalisés par Clément Design (France).
              </span>
            </CardContent>
          </Card>
        )}

        {erreurCatalogue && (
          <Card className="mb-6 border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-950/30">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2 text-sm text-red-800 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                Impossible de charger le catalogue : {erreurCatalogue}
              </div>
              <Button size="sm" variant="outline" onClick={chargerCatalogue}>
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                Réessayer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Sélecteur d'espace de travail : étiquettes ou colisage */}
        <div className="mb-6 flex justify-center">
          <div
            role="tablist"
            aria-label="Choisir l'espace de travail"
            className="inline-flex w-full max-w-md rounded-xl border bg-white p-1 shadow-sm dark:bg-zinc-900 sm:w-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={vue === "etiquettes"}
              onClick={() => setVue("etiquettes")}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none ${
                vue === "etiquettes"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-zinc-600 hover:bg-amber-50 hover:text-amber-800 dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
              }`
            }
            >
              <Tags className="h-4 w-4" aria-hidden="true" />
              Étiquettes &amp; impression
            </button>
            {!estFaconnier && (
              <button
                type="button"
                role="tab"
                aria-selected={vue === "colisage"}
                onClick={() => setVue("colisage")}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none ${
                  vue === "colisage"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-zinc-600 hover:bg-amber-50 hover:text-amber-800 dark:text-zinc-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
                }`
              }
              >
                <Package className="h-4 w-4" aria-hidden="true" />
                Colisage
              </button>
            )}
          </div>
        </div>

        {/* Vue Étiquettes : génération + file + aperçu + journal + stats */}
        <div
          className={
            vue === "etiquettes" ? "grid gap-6 lg:grid-cols-12" : "hidden"
          }
        >
          {/* ------------------------- Colonne gauche ------------------------- */}
          <div className="min-w-0 space-y-6 lg:col-span-7">
            {/* Formulaire */}
            <CarteAnimee delai={0}>
            <Card className="card-lift">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Printer className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  Référence à étiqueter
                </CardTitle>
                <CardDescription>
                  Sélectionnez l&apos;article, la couleur, la taille, puis saisissez
                  l&apos;OF et le type de produit.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Article (liste avec recherche) + recherche avancée */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="article">Article</Label>
                    <button
                      type="button"
                      onClick={ouvrirRecherche}
                      className="flex items-center gap-1 rounded text-xs font-medium text-amber-700 transition-colors hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                      aria-label="Ouvrir la recherche avancée dans le catalogue"
                    >
                      <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                      Recherche avancée
                      <kbd
                        className="hidden rounded border bg-white px-1 py-0.5 font-mono text-[10px] font-normal text-zinc-500 shadow-sm sm:inline dark:bg-zinc-800 dark:text-zinc-400"
                        aria-hidden="true"
                      >
                        {themeMonte && estMac ? "⌘K" : "Ctrl K"}
                      </kbd>
                    </button>
                  </div>
                  <Popover open={articleOuvert} onOpenChange={setArticleOuvert}>
                    <PopoverTrigger asChild>
                      <Button
                        id="article"
                        variant="outline"
                        role="combobox"
                        aria-expanded={articleOuvert}
                        className="h-11 w-full justify-between font-normal"
                        disabled={chargementCatalogue}
                      >
                        <span className={article ? "" : "text-muted-foreground"}>
                          {article || "Rechercher un article…"}
                        </span>
                        <svg
                          className="h-4 w-4 opacity-50"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden="true"
                        >
                          <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
                        </svg>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Rechercher un article…" />
                        <CommandList className="max-h-72">
                          <CommandEmpty>Aucun article trouvé.</CommandEmpty>
                          {/* Articles épinglés (favoris) — groupe en tête de liste */}
                          {articlesFavoris.filter((a) => articles.includes(a)).length > 0 && (
                            <>
                              <CommandGroup heading="★ Favoris">
                                {articlesFavoris
                                  .filter((a) => articles.includes(a))
                                  .map((a) => (
                                    <CommandItem
                                      key={`fav-${a}`}
                                      value={`fav ${a}`}
                                      onSelect={() => choisirArticle(a)}
                                    >
                                      <CheckCircle2
                                        className={`mr-2 h-4 w-4 ${
                                          a === article
                                            ? "opacity-100 text-amber-600"
                                            : "opacity-0"
                                        }`}
                                        aria-hidden="true"
                                      />
                                      <span className="flex-1 truncate font-medium">{a}</span>
                                      <button
                                        type="button"
                                        aria-label={`Retirer ${a} des favoris`}
                                        className="rounded p-0.5 text-amber-500 transition-colors hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-950/50"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          basculerFavori(a);
                                        }}
                                      >
                                        <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                                      </button>
                                    </CommandItem>
                                  ))}
                              </CommandGroup>
                              <CommandSeparator />
                            </>
                          )}
                          <CommandGroup
                            heading={
                              articlesFavoris.filter((a) => articles.includes(a)).length > 0
                                ? "Tous les articles"
                                : undefined
                            }
                          >
                            {articles.map((a) => (
                              <CommandItem
                                key={a}
                                value={a}
                                onSelect={() => choisirArticle(a)}
                              >
                                <CheckCircle2
                                  className={`mr-2 h-4 w-4 ${
                                    a === article
                                      ? "opacity-100 text-amber-600"
                                      : "opacity-0"
                                  }`}
                                  aria-hidden="true"
                                />
                                <span className="flex-1 truncate">{a}</span>
                                <button
                                  type="button"
                                  aria-label={
                                    articlesFavoris.includes(a)
                                      ? `Retirer ${a} des favoris`
                                      : `Épingler ${a} dans les favoris`
                                  }
                                  className={`rounded p-0.5 transition-colors hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-950/50 ${
                                    articlesFavoris.includes(a)
                                      ? "text-amber-500"
                                      : "text-zinc-300 hover:text-amber-600 dark:text-zinc-600"
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    basculerFavori(a);
                                  }}
                                >
                                  <Star
                                    className={`h-3.5 w-3.5 ${
                                      articlesFavoris.includes(a) ? "fill-current" : ""
                                    }`}
                                    aria-hidden="true"
                                  />
                                </button>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {/* Articles favoris et récemment utilisés */}
                  {(articlesFavoris.length > 0 || articlesRecents.length > 0) && (
                    <div className="space-y-1.5 pt-1">
                      {articlesFavoris.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                            Favoris :
                          </span>
                          {articlesFavoris.map((a) => (
                            <button
                              key={a}
                              type="button"
                              onClick={() => choisirArticle(a)}
                              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:border-amber-500 hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950/40 ${
                                a === article
                                  ? "border-amber-500 bg-amber-100 font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
                                  : "border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300/90"
                              }`}
                            >
                              {a}
                            </button>
                          ))}
                        </div>
                      )}
                      {articlesRecents.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">Récents :</span>
                          {articlesRecents.map((a) => (
                            <button
                              key={a}
                              type="button"
                              onClick={() => choisirArticle(a)}
                              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:border-amber-500 hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950/40 ${
                                a === article
                                  ? "border-amber-500 bg-amber-100 font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
                                  : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                              }`}
                            >
                              {a}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Couleur (grille issue du stock) / Manche / Taille (grille triée) */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Couleur</Label>
                      {spe && couleursList.length > 0 && (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          tout le stock · {couleursList.length}
                        </span>
                      )}
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Couleur"
                      className="max-h-52 overflow-y-auto rounded-lg border bg-zinc-50/60 p-2 dark:bg-zinc-900/40"
                    >
                      {couleursList.length === 0 ? (
                        <p className="p-2 text-xs text-muted-foreground">
                          Choisissez d&apos;abord un article.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {couleursList.map((c) => {
                            const actif = c === couleur;
                            return (
                              <button
                                key={c}
                                type="button"
                                role="radio"
                                aria-checked={actif}
                                onClick={() => choisirCouleur(c)}
                                title={`${couleurLabel(c)[0]} (${c})`}
                                className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
                                  actif
                                    ? "border-amber-600 bg-amber-600 font-semibold text-white shadow-sm"
                                    : "border-zinc-200 bg-white text-zinc-700 hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-500 dark:hover:bg-amber-950/40"
                                }`}
                              >
                                <span className="font-medium">{couleurLabel(c)[0]}</span>
                                <span
                                  className={`font-mono text-[10px] ${
                                    actif ? "text-white/70" : "text-muted-foreground"
                                  }`}
                                >
                                  {c}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {spe && (
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        Mode SPE : toutes les couleurs du stock sont disponibles,
                        y compris les combinaisons hors catalogue.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="manche">Manche</Label>
                    <Select
                      value={manche}
                      onValueChange={setManche}
                      disabled={!article || !couleur || !mancheApplicable}
                    >
                      <SelectTrigger id="manche" className="h-11 w-full">
                        <SelectValue
                          placeholder={mancheApplicable ? "Choisir…" : "Sans objet"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(spe ? ["Longues / Long", "Courtes / Short", "3/4 / 3/4"] : manchesList).map(
                          (m) => (
                            <SelectItem key={m} value={m}>
                              {mancheLabel(m)?.[0] ?? m}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Taille</Label>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        du plus petit au plus grand
                      </span>
                    </div>
                    <div
                      role="radiogroup"
                      aria-label="Taille"
                      className="max-h-52 overflow-y-auto rounded-lg border bg-zinc-50/60 p-2 dark:bg-zinc-900/40"
                    >
                      {taillesList.length === 0 ? (
                        <p className="p-2 text-xs text-muted-foreground">
                          Choisissez d&apos;abord une couleur.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {taillesList.map((t) => {
                            const actif = t === taille;
                            return (
                              <button
                                key={t}
                                type="button"
                                role="radio"
                                aria-checked={actif}
                                onClick={() => setTaille(t)}
                                title={tailleLabel(t)[0]}
                                className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-2.5 font-mono text-sm font-semibold transition-colors ${
                                  actif
                                    ? "border-amber-600 bg-amber-600 text-white shadow-sm"
                                    : "border-zinc-200 bg-white text-zinc-700 hover:border-amber-400 hover:bg-amber-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-amber-500 dark:hover:bg-amber-950/40"
                                }`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* OF / Type / SPE */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="of">N° d&apos;OF (ordre de fabrication)</Label>
                    <Input
                      id="of"
                      value={of}
                      onChange={(e) => setOf(e.target.value)}
                      placeholder="ex. 078594"
                      className="h-11"
                      maxLength={20}
                      autoComplete="off"
                    />
                    {/* Derniers n° d'OF utilisés (reprise en un clic) */}
                    {ofsRecents.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Derniers :</span>
                        {ofsRecents.map((o) => (
                          <button
                            key={o}
                            type="button"
                            onClick={() => setOf(o)}
                            className={`rounded-md border px-2 py-0.5 font-mono text-xs transition-colors hover:border-amber-500 hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950/40 ${
                              o === of
                                ? "border-amber-500 bg-amber-100 font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-300"
                                : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                            }`}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type de produit</Label>
                    <Select value={typeValue} onValueChange={choisirType}>
                      <SelectTrigger id="type" className="h-11 w-full">
                        <SelectValue placeholder="Choisir…" />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border bg-zinc-50 p-3 dark:bg-zinc-900/50">
                  <div>
                    <Label htmlFor="spe" className="text-sm font-medium">
                      Mode SPE
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Code-barres calculé automatiquement (préfixe 99) — manche et
                      taille libres.
                    </p>
                  </div>
                  <Switch id="spe" checked={spe} onCheckedChange={changerSpe} />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col items-stretch gap-3 border-t bg-zinc-50/60 p-4 dark:bg-zinc-900/60 sm:flex-row sm:items-center sm:justify-between">
                {champsManquants.length > 0 ? (
                  <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    À compléter : {champsManquants.join(", ")}
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                    </span>
                    Prêt à générer
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reinitialiser}
                  className="self-start sm:self-auto"
                >
                  <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Réinitialiser
                </Button>
              </CardFooter>
            </Card>
            </CarteAnimee>

            {/* File d'impression (lot) — accepte le glisser-déposer d'un .TXT */}
            <CarteAnimee delai={0.08}>
            <Card
              className={`card-lift relative transition-shadow ${
                depotTxtActif
                  ? "ring-2 ring-amber-500/70 ring-offset-2 ring-offset-background dark:ring-offset-zinc-950"
                  : ""
              }`}
              onDragEnter={entrerDepot}
              onDragOver={glisserSurCarte}
              onDragLeave={quitterDepot}
              onDrop={deposerFichier}
            >
              {/* Voile « déposez ici » pendant le survol d'un fichier */}
              {depotTxtActif && (
                <div
                  className="depot-voile pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-amber-500 bg-amber-50/90 dark:bg-zinc-950/90"
                  aria-hidden="true"
                >
                  <div className="flex items-center gap-3 text-amber-800 dark:text-amber-300">
                    <FileUp className="depot-icone h-8 w-8" />
                    <div>
                      <p className="text-lg font-bold">Déposez le fichier .TXT ici</p>
                      <p className="text-sm text-amber-700/80 dark:text-amber-400/80">
                        Ancien export Clé=valeur — les étiquettes rejoignent la file
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    File d&apos;impression
                  </span>
                  <Badge variant="secondary">
                    {fileAttente.length} / {MAX_ETIQUETTES}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Ajoutez plusieurs étiquettes pour les générer en lot. Un lot de
                  N étiquettes produit un fichier .zip contenant un .nlbl par
                  étiquette, données intégrées ; la quantité de chaque ligne est
                  reprise dans le LISEZMOI (copies à imprimer).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Barre de progression du remplissage (≤ 100 étiquettes par lot) */}
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  role="progressbar"
                  aria-label={`Remplissage de la file : ${fileAttente.length} étiquettes sur ${MAX_ETIQUETTES}`}
                  aria-valuenow={remplissageFile}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      remplissageFile >= 90
                        ? "bg-red-500"
                        : "bg-gradient-to-r from-amber-500 to-amber-600"
                    }`}
                    style={{ width: `${remplissageFile}%` }}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={ajouterALaFile}
                        disabled={!peutGenerer || fileAttente.length >= MAX_ETIQUETTES}
                        className="h-11"
                      >
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Ajouter l&apos;étiquette courante
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Ajouter la référence affichée dans le formulaire (Ctrl + M)</p>
                    </TooltipContent>
                  </Tooltip>
                  {/* Mémorisation du lot courant (préset rechargeable en un clic) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={ouvrirDialogLot}
                        disabled={fileAttente.length === 0}
                        className="h-11"
                      >
                        <BookmarkPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Mémoriser le lot
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Enregistrer cette file pour la recharger plus tard</p>
                    </TooltipContent>
                  </Tooltip>
                  {/* Import d'un .TXT historique : les anciens exports redeviennent imprimables */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        onClick={() => fichierTxtRef.current?.click()}
                        className="h-11"
                      >
                        <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
                        Importer un .TXT
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Recharger un ancien export .TXT (Clé=valeur) — ou glissez-le directement sur la carte</p>
                    </TooltipContent>
                  </Tooltip>
                  <input
                    ref={fichierTxtRef}
                    type="file"
                    accept=".txt,text/plain"
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                    onChange={gestionFichierTxt}
                  />
                  {fileAttente.length > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          onClick={() => setFileAttente([])}
                          className="h-11"
                        >
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                          Vider
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Retirer toutes les lignes de la file</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Scan douchette : le scanner agit comme un clavier (code + Entrée) */}
                <form onSubmit={traiterScan} className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <ScanLine
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                      aria-hidden="true"
                    />
                    <Input
                      ref={scanInputRef}
                      value={codeScan}
                      onChange={(e) => setCodeScan(e.target.value)}
                      placeholder="Scannez un code-barres (ou saisissez un EAN-13)…"
                      inputMode="numeric"
                      autoComplete="off"
                      className={`h-11 pl-8 pr-10 font-mono text-sm transition-all ${
                        scanReussi
                          ? "border-green-500 ring-2 ring-green-500/30"
                          : "border-dashed focus-visible:ring-amber-500/40"
                      }`}
                      aria-label="Scanner un code-barres pour l'ajouter à la file"
                    />
                    <kbd
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 shadow-sm dark:bg-zinc-800 dark:text-zinc-400"
                      aria-hidden="true"
                    >
                      ⏎
                    </kbd>
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={!codeScan.trim()}
                    className="h-11 shrink-0"
                  >
                    Ajouter
                  </Button>
                </form>
                <p className="-mt-2 text-xs text-muted-foreground">
                  L&apos;OF et le type du formulaire sont appliqués à chaque scan —
                  restez sur ce champ pour enchaîner les scans.
                </p>

                {/* Groupes de lot mémorisés (rechargement en un clic) */}
                {lotsSauvegardes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Lots mémorisés ({lotsSauvegardes.length}/{MAX_LOTS})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {lotsSauvegardes.map((lot) => (
                        <span
                          key={lot.id}
                          className="group/lot flex items-center overflow-hidden rounded-full border border-amber-300 bg-amber-50 transition-transform hover:scale-[1.03] focus-within:ring-2 focus-within:ring-amber-500/40 dark:border-amber-500/40 dark:bg-amber-950/30"
                        >
                          <button
                            type="button"
                            onClick={() => chargerLot(lot)}
                            className="flex items-center gap-1 py-0.5 pl-2.5 pr-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-950/60"
                            title={`Charger « ${lot.nom} » (${lot.lignes.length} étiquette${lot.lignes.length > 1 ? "s" : ""})`}
                            aria-label={`Charger le lot mémorisé ${lot.nom} (${lot.lignes.length} étiquettes)`}
                          >
                            <BookmarkPlus
                              className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400"
                              aria-hidden="true"
                            />
                            <span className="max-w-40 truncate">{lot.nom}</span>
                            <span className="font-mono text-[10px] tabular-nums text-amber-700/80 dark:text-amber-300/80">
                              {lot.lignes.length} ét.
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Supprimer le lot mémorisé ${lot.nom}`}
                            className="h-full border-l border-amber-300 px-1.5 py-0.5 text-amber-600 transition-colors hover:bg-red-100 hover:text-red-600 dark:border-amber-500/40 dark:text-amber-400 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                            onClick={() => supprimerLot(lot.id)}
                          >
                            <X className="h-3 w-3" aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Aperçu du lot : miniatures des étiquettes de la file
                    (repérage visuel rapide, clic → ligne correspondante) */}
                {fileAttente.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Aperçu du lot
                      </p>
                      {totalCopiesFile > fileAttente.length && (
                        <p className="text-xs text-muted-foreground">
                          {totalCopiesFile} copie{totalCopiesFile > 1 ? "s" : ""} avec les quantités
                        </p>
                      )}
                    </div>
                    <div
                      className="scroll-shadows flex gap-2 overflow-x-auto pb-2"
                      role="list"
                      aria-label="Miniatures des étiquettes de la file"
                    >
                      {fileAttente.slice(0, 12).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="listitem"
                          onClick={() => revelerLigneFile(item.id)}
                          title={`${item.ref}${item.quantite > 1 ? ` — ×${item.quantite} copies` : ""} (afficher la ligne)`}
                          aria-label={`Miniature ${item.ref}${item.quantite > 1 ? `, ${item.quantite} copies` : ""} — afficher la ligne dans la file`}
                          className="etiquette-mini relative shrink-0 rounded-md border-2 border-zinc-300 bg-white p-1.5 text-black shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-600"
                        >
                          {item.quantite > 1 && (
                            <span
                              className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-600 px-1 font-mono text-[10px] font-bold text-white shadow"
                              aria-hidden="true"
                            >
                              ×{item.quantite}
                            </span>
                          )}
                          <span className="flex items-baseline justify-between gap-1">
                            <span className="truncate text-[10px] font-extrabold leading-tight tracking-wide">
                              {item.etiquette.modele}
                            </span>
                            <span className="shrink-0 text-[9px] font-bold">
                              {item.etiquette.taille}
                            </span>
                          </span>
                          <span className="flex items-baseline justify-between">
                            <span className="truncate text-[9px] font-semibold">
                              {item.etiquette.couleur}
                            </span>
                            <span className="shrink-0 text-[8px] text-zinc-500">
                              OF {item.etiquette.of}
                            </span>
                          </span>
                          <span className="my-0.5 block border-t border-black" aria-hidden="true" />
                          <span className="flex justify-center">
                            <Ean13Svg
                              code={item.etiquette.codeBarre}
                              moduleW={1}
                              className="h-9 w-auto"
                            />
                          </span>
                        </button>
                      ))}
                      {fileAttente.length > 12 && (
                        <div
                          role="listitem"
                          className="flex w-14 shrink-0 flex-col items-center justify-center rounded-md border border-dashed border-zinc-300 text-center dark:border-zinc-600"
                          aria-hidden="true"
                        >
                          <span className="text-sm font-bold text-zinc-500">
                            +{fileAttente.length - 12}
                          </span>
                          <span className="text-[9px] uppercase tracking-wide text-zinc-400">
                            autres
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {fileAttente.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-6 text-center">
                    <Layers className="h-6 w-6 text-zinc-300 dark:text-zinc-600" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      La file est vide — complétez le formulaire, scannez un
                      code-barres, importez ou glissez-déposez un .TXT pour
                      composer un lot.
                    </p>
                  </div>
                ) : (
                  <div className="scroll-shadows max-h-96 overflow-y-auto rounded-lg border">
                    <ul className="divide-y">
                      {fileAttente.map((item, index) => (
                        <li
                          key={item.id}
                          id={`file-ligne-${item.id}`}
                          className={`flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors duration-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                            ligneEclat === item.id
                              ? "bg-amber-50 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-700/50"
                              : ""
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <Badge
                              variant="outline"
                              className="w-9 shrink-0 justify-center font-mono"
                            >
                              {String(index + 1).padStart(2, "0")}
                            </Badge>
                            <span className="truncate" title={item.ref}>
                              {item.ref}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            {/* Quantité de copies (reprise dans le LISEZMOI du .zip) */}
                            <div
                              className="flex items-center rounded-md border bg-white dark:bg-zinc-900"
                              role="group"
                              aria-label={`Quantité de copies pour ${item.ref}`}
                            >
                              <button
                                type="button"
                                aria-label="Retirer une copie"
                                disabled={item.quantite <= 1}
                                onClick={() => changerQuantite(item.id, -1)}
                                className="flex h-7 w-7 items-center justify-center rounded-l-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                              >
                                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <span
                                className={`w-9 text-center font-mono text-xs tabular-nums ${
                                  item.quantite > 1
                                    ? "font-semibold text-amber-700 dark:text-amber-400"
                                    : "text-zinc-600 dark:text-zinc-300"
                                }`}
                              >
                                ×{item.quantite}
                              </span>
                              <button
                                type="button"
                                aria-label="Ajouter une copie"
                                disabled={item.quantite >= 99}
                                onClick={() => changerQuantite(item.id, +1)}
                                className="flex h-7 w-7 items-center justify-center rounded-r-md text-zinc-500 transition-colors hover:bg-amber-50 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </div>
                            <button
                              type="button"
                              aria-label={`Retirer ${item.ref}`}
                              className="rounded p-1 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              onClick={() =>
                                setFileAttente((q) => q.filter((x) => x.id !== item.id))
                              }
                            >
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
              <CardFooter className="border-t bg-zinc-50/60 p-4 dark:bg-zinc-900/60">
                <Button
                  onClick={genererLot}
                  disabled={fileAttente.length === 0 || lotEnCours}
                  className="h-11 w-full whitespace-normal bg-amber-600 text-left text-white hover:bg-amber-700 sm:w-auto"
                >
                  {lotEnCours ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileArchive className="mr-2 h-4 w-4" aria-hidden="true" />
                  )}
                  {lotEnCours
                    ? "Génération du lot…"
                    : fileAttente.length === 1
                      ? `Générer le lot — 1 fichier .NLBL${totalCopiesFile > 1 ? ` (×${totalCopiesFile} copies)` : ""}`
                      : `Générer le lot — archive .zip de ${fileAttente.length} fichiers (${totalCopiesFile} copies)`}
                </Button>
              </CardFooter>
            </Card>
            </CarteAnimee>
          </div>

          {/* ------------------------- Colonne droite ------------------------- */}
          <div className="min-w-0 space-y-6 lg:col-span-5">
            {/* Aperçu */}
            <CarteAnimee delai={0.16}>
            <Card className="card-lift">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span>Aperçu de l&apos;étiquette</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Agrandir l'aperçu de l'étiquette"
                        disabled={!etiquette}
                        onClick={() => setApercuGrand(true)}
                        className="h-8 w-8 text-zinc-500 hover:text-amber-700"
                      >
                        <Maximize2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Agrandir l&apos;aperçu (vérification avant impression)</p>
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
                <CardDescription>
                  Format 55 × 35 mm — rendu identique à l'étiquette imprimée.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Zone de découpe (repère de couteau autour de l'étiquette) */}
                <div className="relative mx-auto w-full max-w-md">
                  <div
                    className="pointer-events-none absolute -inset-2.5 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-600"
                    aria-hidden="true"
                  >
                    <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-[10px] font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                      Découpe 55 × 35 mm
                    </span>
                  </div>
                <div
                  className={`relative mx-auto w-full rounded-lg border-2 bg-white p-4 shadow-md transition-all sm:p-6 dark:bg-white ${
                    peutGenerer
                      ? "border-green-600 ring-2 ring-green-600/20"
                      : "border-zinc-300 dark:border-zinc-600"
                  }`}
                  aria-label="Aperçu de l'étiquette"
                >
                  {etiquette ? (
                    <div className="space-y-1 text-black">
                      {/* Logo entreprise — proportions préservées, hauteur réduite
                          pour laisser la place aux informations essentielles */}
                      <img
                        src="/logo-clement.png"
                        alt="Clément Design"
                        className="mx-auto mb-1 h-5 w-auto object-contain"
                        width={170}
                        height={20}
                      />
                      <p className="truncate text-center text-2xl font-extrabold tracking-wide sm:text-3xl">
                        {etiquette.modele}
                      </p>
                      <div className="flex items-baseline justify-between text-lg font-bold sm:text-xl">
                        <span className="truncate">{etiquette.couleur}</span>
                        <span>{etiquette.taille}</span>
                      </div>
                      <div className="my-2 border-t-2 border-black" aria-hidden="true" />
                      <p className="text-center text-base font-bold sm:text-lg">
                        {etiquette.type}
                      </p>
                      {etiquette.manche && (
                        <p className="text-center text-sm font-semibold sm:text-base">
                          {etiquette.manche}
                        </p>
                      )}
                      <div className="mt-3 flex justify-center">
                        <Ean13Svg code={etiquette.codeBarre} />
                      </div>
                      <p className="mt-1 text-center text-lg font-extrabold sm:text-xl">
                        OF: {etiquette.of || "——"}
                      </p>
                    </div>
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded text-sm text-zinc-400">
                      Sélectionnez une référence pour prévisualiser l&apos;étiquette.
                    </div>
                  )}
                </div>
                </div>

                {/* Table des variables (miroir de Zebra Designer) */}
                {etiquette && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Variables intégrées au fichier
                      </p>
                      <div className="flex items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={chargerApercuFichier}
                              disabled={apercuFichierEnCours}
                              className="h-7 px-2 text-xs text-zinc-500 hover:text-amber-700"
                              aria-label="Afficher le contenu exact du fichier .NLBL"
                            >
                              {apercuFichierEnCours ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <FileSearch className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              Contenu
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Vérifier le contenu exact du fichier (XML, entrées, imprimante)</p>
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={copierValeurs}
                          className="h-7 px-2 text-xs text-zinc-500 hover:text-amber-700"
                          aria-label="Copier les 7 variables dans le presse-papiers"
                        >
                          {valeursCopiees ? (
                            <Check className="mr-1 h-3.5 w-3.5 text-green-600" aria-hidden="true" />
                          ) : (
                            <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {valeursCopiees ? "Copié" : "Copier"}
                        </Button>
                      </div>
                    </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        Variables qui seront intégrées au fichier .NLBL
                      </caption>
                      <tbody className="divide-y">
                        {(
                          [
                            ["Modele", etiquette.modele],
                            ["Manche", etiquette.manche || "—"],
                            ["Taille", etiquette.taille],
                            ["OF", etiquette.of || "—"],
                            ["Couleur", etiquette.couleur],
                            ["Type", etiquette.type],
                            ["CodeBarre", etiquette.codeBarre],
                          ] as const
                        ).map(([invite, valeur]) => (
                          <tr key={invite} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                            <th
                              scope="row"
                              className="w-24 bg-zinc-50 px-3 py-1.5 text-left font-medium text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300"
                            >
                              {invite}
                            </th>
                            <td className="px-3 py-1.5 font-mono text-xs">
                              {valeur}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-3 border-t bg-zinc-50/60 p-4 dark:bg-zinc-900/60">
                <Button
                  onClick={() =>
                    etiquette && genererNlbl([etiquette], setGenerationEnCours)
                  }
                  disabled={!peutGenerer || generationEnCours}
                  className="btn-shine h-12 w-full bg-amber-600 text-base font-semibold text-white hover:bg-amber-700"
                >
                  {generationEnCours ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileDown className="mr-2 h-5 w-5" aria-hidden="true" />
                  )}
                  {generationEnCours
                    ? "Génération en cours…"
                    : "Générer le fichier .NLBL"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Les données sont intégrées au fichier : ouvrez-le dans Zebra
                  Designer et imprimez directement — aucune importation de fichier
                  texte. Astuce : raccourci clavier{" "}
                  <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                    Ctrl + ⏎
                  </kbd>
                </p>
                <Separator />
                <Button
                  variant="outline"
                  onClick={exporterTxt}
                  disabled={!peutGenerer}
                  className="h-11 w-full whitespace-normal"
                >
                  <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                  Exporter le fichier .TXT (historique)
                </Button>
              </CardFooter>
            </Card>
            </CarteAnimee>

            {/* Historique */}
            <CarteAnimee delai={0.24}>
            <Card className="card-lift">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <History className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    Dernières générations
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Sauvegarder le journal au format JSON"
                          onClick={exporterSauvegarde}
                          disabled={sauvegardeJsonEnCours}
                          className="h-8 w-8"
                        >
                          {sauvegardeJsonEnCours ? (
                            <Loader2
                              className="h-4 w-4 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <FolderDown className="h-4 w-4" aria-hidden="true" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Sauvegarder le journal au format JSON (restaurable)</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Restaurer une sauvegarde du journal"
                          onClick={() => fichierRestaurationRef.current?.click()}
                          className="h-8 w-8"
                        >
                          <FolderUp className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Restaurer une sauvegarde JSON (doublons ignorés)</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Vider tout le journal"
                          disabled={historique.length === 0 || purgeEnCours}
                          onClick={() => setPurgeOuverte(true)}
                          className="h-8 w-8 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        >
                          <Eraser className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Vider tout le journal (historique + statistiques)</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Rafraîchir l'historique"
                          onClick={() => chargerHistorique()}
                          className="h-8 w-8"
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Rafraîchir l&apos;historique</p>
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Filtre par type + recherche locale (fichier, modèle, OF) + export CSV */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    ["TOUS", "Tous"],
                    ["NLBL", ".nlbl"],
                    ["TXT", ".txt"],
                  ] as const).map(([valeur, libelle]) => {
                    const effectif =
                      valeur === "TOUS"
                        ? historique.length
                        : historique.filter((h) => h.kind === valeur).length;
                    return (
                      <button
                        key={valeur}
                        type="button"
                        onClick={() => setFiltreTypeHisto(valeur)}
                        aria-pressed={filtreTypeHisto === valeur}
                        className={`${classesChipFiltre(
                          filtreTypeHisto === valeur
                        )} tabular-nums`}
                      >
                        {libelle} ({effectif})
                      </button>
                    );
                  })}
                </div>
                {/* Filtre par période (serveur) : préréglages + plage personnalisée */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    Période :
                  </span>
                  {([
                    ["aujourdhui", "Aujourd'hui"],
                    ["7j", "7 jours"],
                    ["30j", "30 jours"],
                    ["tout", "Tout"],
                  ] as const).map(([valeur, libelle]) => (
                    <button
                      key={valeur}
                      type="button"
                      onClick={() => setPeriodeHisto(valeur)}
                      aria-pressed={periodeHisto === valeur}
                      className={classesChipFiltre(periodeHisto === valeur)}
                    >
                      {libelle}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (periodeHisto === "personnalisee") {
                        setPeriodeHisto("tout");
                        return;
                      }
                      setPeriodeHisto("personnalisee");
                      // Préremplissage avec les 7 derniers jours (repère pratique)
                      if (!dateDebutHisto && !dateFinHisto) {
                        const auj = jourParis();
                        setDateDebutHisto(jourMoins(auj, 6));
                        setDateFinHisto(auj);
                      }
                    }}
                    aria-pressed={periodeHisto === "personnalisee"}
                    className={classesChipFiltre(
                      periodeHisto === "personnalisee"
                    )}
                  >
                    Dates…
                  </button>
                  {periodeHisto === "personnalisee" && (
                    <span className="flex flex-wrap items-center gap-1">
                      <Input
                        type="date"
                        value={dateDebutHisto}
                        onChange={(e) => setDateDebutHisto(e.target.value)}
                        aria-label="Date de début de la période du journal"
                        className="h-8 w-[9.5rem] bg-white px-2 text-xs dark:bg-zinc-900"
                      />
                      <span
                        className="text-xs text-muted-foreground"
                        aria-hidden="true"
                      >
                        →
                      </span>
                      <Input
                        type="date"
                        value={dateFinHisto}
                        onChange={(e) => setDateFinHisto(e.target.value)}
                        aria-label="Date de fin de la période du journal"
                        className="h-8 w-[9.5rem] bg-white px-2 text-xs dark:bg-zinc-900"
                      />
                    </span>
                  )}
                </div>
                {plageInvalide && (
                  <p
                    className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    La date de début est postérieure à la date de fin.
                  </p>
                )}
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                      aria-hidden="true"
                    />
                    <Input
                      value={rechercheHisto}
                      onChange={(e) => setRechercheHisto(e.target.value)}
                      placeholder="Filtrer par fichier, modèle ou OF…"
                      className="h-9 pl-8 text-sm"
                      aria-label="Filtrer le journal des générations"
                    />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exporterCsv}
                        disabled={csvEnCours}
                        className="h-9 shrink-0"
                      >
                        {csvEnCours ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        ) : (
                          <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        CSV
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Exporter le journal au format CSV (Excel)
                        {periodeActive ? " — période sélectionnée uniquement" : ""}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {chargementHisto && historique.length === 0 ? (
                  /* Skeleton du journal pendant le premier chargement */
                  <div className="space-y-2 py-1" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-lg border p-2.5"
                      >
                        <Skeleton className="h-5 w-12 rounded-full" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-3/5" />
                          <Skeleton className="h-2.5 w-2/5" />
                        </div>
                        <Skeleton className="h-3 w-16" />
                      </div>
                    ))}
                  </div>
                ) : historique.length === 0 ? (
                  periodeActive ? (
                    <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                      <CalendarX className="h-6 w-6 text-zinc-300" aria-hidden="true" />
                      <p className="text-sm text-muted-foreground">
                        Aucune génération sur la période sélectionnée.
                      </p>
                      <button
                        type="button"
                        onClick={() => setPeriodeHisto("tout")}
                        className="text-xs font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
                      >
                        Élargir la période (tout afficher)
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                      <History className="h-6 w-6 text-zinc-300" aria-hidden="true" />
                      <p className="text-sm text-muted-foreground">
                        Aucune génération enregistrée pour le moment.
                      </p>
                    </div>
                  )
                ) : historiqueFiltre.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    Aucun fichier ne correspond à « {rechercheHisto} ».
                  </p>
                ) : (
                  <>
                    <div className="scroll-shadows max-h-96 overflow-y-auto rounded-lg border">
                      <ul className="divide-y">
                        {historiqueFiltre.map((h, index) => (
                        <motion.li
                          key={h.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            duration: 0.25,
                            delay: Math.min(index * 0.04, 0.4),
                            ease: "easeOut",
                          }}
                          className="group flex items-center justify-between gap-3 border-l-2 border-transparent px-3 py-2 text-sm transition-colors hover:border-amber-500/70 hover:bg-zinc-50 dark:hover:border-amber-500/60 dark:hover:bg-zinc-800/50"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <Badge
                              className={
                                h.kind === "NLBL"
                                  ? "shrink-0 bg-amber-600 text-white hover:bg-amber-600"
                                  : "shrink-0 bg-zinc-200 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200"
                              }
                            >
                              {h.kind}
                            </Badge>
                            {h.labelsCount > 1 && (
                              <Badge
                                variant="outline"
                                className="shrink-0 border-amber-300 bg-amber-50 font-mono text-[10px] text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                              >
                                ×{h.labelsCount}
                              </Badge>
                            )}
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-mono text-xs" title={h.filename}>
                                {h.filename}
                              </span>
                              {(h.modele || h.of) && (
                                <span className="truncate text-[11px] text-muted-foreground">
                                  {[h.modele, h.of ? `OF ${h.of}` : null]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {new Date(h.createdAt).toLocaleString("fr-FR", {
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Europe/Paris",
                              })}
                            </span>
                            {/* Régénération : remet les étiquettes de l'entrée dans la file */}
                            {h.kind === "NLBL" &&
                              (h.regenerable ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      aria-label={`Remettre les étiquettes de ${h.filename} dans la file d'impression`}
                                      className="rounded p-1 text-zinc-300 opacity-0 transition-all hover:bg-amber-50 hover:text-amber-700 focus-visible:opacity-100 group-hover:opacity-100 dark:text-zinc-600 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                                      onClick={() => regenererDepuisJournal(h)}
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      Remettre les {h.etiquettes?.length ?? 0} étiquette
                                      {(h.etiquettes?.length ?? 0) > 1 ? "s" : ""} dans la file
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      disabled
                                      aria-label="Régénération indisponible pour cette ancienne entrée"
                                      className="cursor-not-allowed rounded p-1 text-zinc-200 opacity-0 transition-all group-hover:opacity-100 dark:text-zinc-700"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      Détails incomplets (ancienne génération) — les
                                      nouvelles générations sont régénérables
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            {/* Suppression de l'entrée (confirmation via AlertDialog) */}
                            <button
                              type="button"
                              aria-label={`Supprimer l'entrée ${h.filename} du journal`}
                              className="rounded p-1 text-zinc-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:text-zinc-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              onClick={() => setSuppressionCible(h)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </span>
                        </motion.li>
                      ))}
                      </ul>
                    </div>
                    {/* Pagination : charge les entrées plus anciennes par pages de 20 */}
                    <div className="flex flex-col items-center gap-2 border-t pt-3">
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {historique.length} entrée{historique.length > 1 ? "s" : ""} affichée
                        {historique.length > 1 ? "s" : ""} sur{" "}
                        {historiqueTotal.toLocaleString("fr-FR")}
                        {periodeActive
                          ? " — période filtrée (les dates s’appliquent au serveur)"
                          : ""}
                        {rechercheHisto
                          ? " — la recherche porte sur les entrées chargées"
                          : ""}
                      </p>
                      {historiqueEncore && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={chargerPlusHistorique}
                          disabled={chargerPlusEnCours}
                          className="h-8"
                        >
                          {chargerPlusEnCours ? (
                            <Loader2
                              className="mr-2 h-3.5 w-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronDown
                              className="mr-2 h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          )}
                          Charger plus (20 suivantes)
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            </CarteAnimee>
          </div>

          {/* ------------------------- Statistiques (pleine largeur) ------------------------- */}
          <div className="min-w-0 lg:col-span-12">
            <CarteAnimee delai={0.32}>
            <Card className="card-lift">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    Activité ({stats?.jours ?? 7} derniers jours)
                  </span>
                  <span className="flex items-center gap-1">
                    {/* Période de la répartition quotidienne */}
                    <Select
                      value={periodeStats}
                      onValueChange={(v) => {
                        setPeriodeStats(v);
                        chargerStats(Number(v));
                      }}
                    >
                      <SelectTrigger
                        className="h-8 w-[152px] text-xs"
                        aria-label="Période des statistiques"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 derniers jours</SelectItem>
                        <SelectItem value="14">14 derniers jours</SelectItem>
                        <SelectItem value="30">30 derniers jours</SelectItem>
                      </SelectContent>
                    </Select>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Rafraîchir les statistiques"
                          onClick={() => chargerStats(Number(periodeStats))}
                          className="h-8 w-8"
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Rafraîchir les statistiques</p>
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </CardTitle>
                <CardDescription>
                  Cumuls totaux et répartition quotidienne des fichiers générés
                  (fuseau Europe/Paris) — période ajustable.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {chargementStats && !stats ? (
                  /* Skeleton des KPI et du graphique pendant le chargement */
                  <div className="grid gap-6 md:grid-cols-3" aria-hidden="true">
                    <div className="grid grid-cols-2 gap-3">
                      {[0, 1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-[84px] rounded-lg" />
                      ))}
                    </div>
                    <Skeleton className="h-56 rounded-lg md:col-span-2" />
                  </div>
                ) : (
                <div className="grid gap-6 md:grid-cols-3">
                {/* Indicateurs clés (totaux cumulés + moyenne sur 7 jours) */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col justify-between gap-2 rounded-lg border bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-sm dark:bg-zinc-900 dark:hover:border-amber-500/40">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                      <FileDown className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xl font-bold leading-none tabular-nums">
                        <CompteurAnime valeur={stats?.totalNlbl ?? 0} />
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">fichiers .NLBL générés</p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between gap-2 rounded-lg border bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-sm dark:bg-zinc-900 dark:hover:border-zinc-500">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xl font-bold leading-none tabular-nums">
                        <CompteurAnime valeur={stats?.totalTxt ?? 0} />
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">fichiers .TXT exportés</p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between gap-2 rounded-lg border bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-green-300 hover:shadow-sm dark:bg-zinc-900 dark:hover:border-green-500/40">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400">
                      <Tags className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xl font-bold leading-none tabular-nums">
                        <CompteurAnime valeur={stats?.totalEtiquettes ?? 0} />
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">étiquettes prêtes à imprimer</p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between gap-2 rounded-lg border bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-sm dark:bg-zinc-900 dark:hover:border-amber-500/40">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
                      <Hash className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xl font-bold leading-none tabular-nums">
                        <CompteurAnime
                          valeur={
                            (stats?.semaineEtiquettes ?? 0) / (stats?.jours ?? 7)
                          }
                          decimales={1}
                        />
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        étiquettes / jour ({stats?.jours ?? 7} derniers jours)
                      </p>
                    </div>
                  </div>
                </div>
                {/* Graphique (overflow-hidden : évite tout débordement lors d'un redimensionnement) */}
                <div className="h-56 overflow-hidden md:col-span-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.parJour ?? []} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={themeSombre ? "#3f3f46" : "#e4e4e7"}
                      />
                      <XAxis
                        dataKey="libelle"
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        stroke={themeSombre ? "#a1a1aa" : "#71717a"}
                        // Étiquettes espacées sur les longues périodes
                        interval={
                          stats && stats.parJour.length > 14
                            ? 4
                            : stats && stats.parJour.length > 7
                              ? 1
                              : 0
                        }
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        fontSize={12}
                        stroke={themeSombre ? "#a1a1aa" : "#71717a"}
                      />
                      <ChartTooltip
                        cursor={{ fill: themeSombre ? "rgba(217, 119, 6, 0.14)" : "rgba(217, 119, 6, 0.07)" }}
                        contentStyle={{
                          borderRadius: 8,
                          border: `1px solid ${themeSombre ? "#3f3f46" : "#e4e4e7"}`,
                          backgroundColor: themeSombre ? "#18181b" : "#ffffff",
                          color: themeSombre ? "#f4f4f5" : "#18181b",
                          fontSize: 12,
                        }}
                        formatter={(valeur, nom) => [String(valeur), nom as string]}
                      />
                      <Bar
                        dataKey="nlbl"
                        name="Fichiers .NLBL"
                        fill="#d97706"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={30}
                      />
                      <Bar
                        dataKey="txt"
                        name="Fichiers .TXT"
                        fill={themeSombre ? "#52525b" : "#d4d4d8"}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={30}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                </div>
                )}

                {/* Rappel de période : meilleur jour + jours actifs */}
                {stats && stats.parJour.length > 0 && (
                  <div
                    className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground"
                    aria-label="Synthèse de la période : meilleur jour et jours actifs"
                  >
                    {meilleurJourStats && meilleurJourStats.etiquettes > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Trophy
                          className="h-3.5 w-3.5 text-amber-500"
                          aria-hidden="true"
                        />
                        Meilleur jour :{" "}
                        <span className="font-semibold text-foreground">
                          {meilleurJourStats.libelle}
                        </span>
                        <span className="tabular-nums">
                          ({meilleurJourStats.etiquettes} ét.)
                        </span>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <CalendarCheck
                        className="h-3.5 w-3.5 text-amber-500"
                        aria-hidden="true"
                      />
                      Jours actifs :{" "}
                      <span className="font-semibold tabular-nums text-foreground">
                        {joursActifs} / {stats.parJour.length}
                      </span>
                    </span>
                  </div>
                )}

                {/* Classement des modèles les plus générés sur la période */}
                {stats?.topModeles && stats.topModeles.length > 0 && (
                  <div className="rounded-lg border bg-zinc-50/60 p-3 dark:bg-zinc-900/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Trophy className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                        Top modèles — {stats.jours} derniers jours
                      </p>
                      <p className="hidden text-[10px] text-muted-foreground sm:block">
                        étiquettes · fichiers
                      </p>
                    </div>
                    <ol className="mt-2.5 space-y-2">
                      {stats.topModeles.map((m, i) => {
                        const max = stats.topModeles[0]?.etiquettes || 1;
                        return (
                          <li
                            key={m.modele}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${
                                i === 0
                                  ? "bg-amber-500 text-white"
                                  : "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                              }`}
                              aria-hidden="true"
                            >
                              {i + 1}
                            </span>
                            <span
                              className="w-28 shrink-0 truncate font-medium sm:w-44"
                              title={m.modele}
                            >
                              {m.modele}
                            </span>
                            <span
                              className="relative h-2 min-w-8 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                              role="presentation"
                            >
                              <span
                                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all"
                                style={{
                                  width: `${Math.max(
                                    6,
                                    Math.round((m.etiquettes / max) * 100)
                                  )}%`,
                                }}
                              />
                            </span>
                            <span className="w-20 shrink-0 text-right tabular-nums text-muted-foreground">
                              {m.etiquettes} ét. · {m.fichiers} f.
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
              </CardContent>
            </Card>
            </CarteAnimee>
          </div>
        </div>

        {/* Vue Colisage : scans → regroupement automatique OF → modèle → couleur → taille */}
        <div className={vue === "colisage" ? "space-y-6" : "hidden"}>
          <ColisageWorkspace />
        </div>
      </main>

      {/* Aperçu agrandi (vérification finale avant impression) */}
      <Dialog open={apercuGrand} onOpenChange={setApercuGrand}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Vérification avant impression</DialogTitle>
            <DialogDescription>
              Contrôlez le modèle, la couleur, la taille, l&apos;OF et le
              code-barres, puis générez le fichier .NLBL.
            </DialogDescription>
          </DialogHeader>
          {etiquette ? (
            <div
              className={`rounded-lg border-2 bg-white p-6 text-black shadow-inner ${
                peutGenerer ? "border-green-600" : "border-zinc-300 dark:border-zinc-600"
              }`}
              aria-label="Aperçu agrandi de l'étiquette"
            >
              <img
                src="/logo-clement.png"
                alt="Clément Design"
                className="mx-auto mb-2 h-8 w-auto object-contain"
                width={272}
                height={32}
              />
              <p className="truncate text-center text-4xl font-extrabold tracking-wide">
                {etiquette.modele}
              </p>
              <div className="mt-1 flex items-baseline justify-between text-2xl font-bold">
                <span className="truncate">{etiquette.couleur}</span>
                <span>{etiquette.taille}</span>
              </div>
              <div className="my-3 border-t-[3px] border-black" aria-hidden="true" />
              <p className="text-center text-2xl font-bold">{etiquette.type}</p>
              {etiquette.manche && (
                <p className="text-center text-xl font-semibold">{etiquette.manche}</p>
              )}
              <div className="mt-5 flex justify-center">
                <Ean13Svg code={etiquette.codeBarre} moduleW={3} />
              </div>
              <p className="mt-2 text-center text-2xl font-extrabold">
                OF: {etiquette.of || "——"}
              </p>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sélectionnez une référence pour afficher l&apos;aperçu agrandi.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog : recherche avancée dans le catalogue (multi-critères) */}
      <Dialog open={dialogRecherche} onOpenChange={setDialogRecherche}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Recherche avancée dans le catalogue
            </DialogTitle>
            <DialogDescription>
              Filtrez les {records.length.toLocaleString("fr-FR")} références par
              article, couleur, manche, taille ou code-barres, puis cliquez sur un
              résultat pour remplir automatiquement le formulaire.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Article ou code-barres (recherche plein texte) */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="rech-texte">Article ou code-barres</Label>
                <div className="relative">
                  <Search
                    className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                  <Input
                    id="rech-texte"
                    value={rechTexte}
                    onChange={(e) => setRechTexte(e.target.value)}
                    placeholder="ex. FIRENZE ou 37007917…"
                    className="h-9 pl-8"
                    autoComplete="off"
                  />
                </div>
              </div>
              {/* Couleur (liste complète du catalogue) */}
              <div className="space-y-1.5">
                <Label>Couleur</Label>
                <Select
                  value={rechCouleur}
                  onValueChange={(v) => setRechCouleur(v === "*" ? "" : v)}
                >
                  <SelectTrigger className="h-9 w-full" aria-label="Filtrer par couleur">
                    <SelectValue placeholder="Toutes les couleurs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*">Toutes les couleurs</SelectItem>
                    {toutesCouleurs.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c} — {couleurLabel(c)[0]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Manche */}
              <div className="space-y-1.5">
                <Label>Manche</Label>
                <Select
                  value={rechManche}
                  onValueChange={(v) => setRechManche(v === "*" ? "" : v)}
                >
                  <SelectTrigger className="h-9 w-full" aria-label="Filtrer par manche">
                    <SelectValue placeholder="Toutes les manches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*">Toutes les manches</SelectItem>
                    {tousManches.map((m) => (
                      <SelectItem key={m} value={m}>
                        {mancheLabel(m)?.[0] ?? m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Taille */}
              <div className="space-y-1.5">
                <Label>Taille</Label>
                <Select
                  value={rechTaille}
                  onValueChange={(v) => setRechTaille(v === "*" ? "" : v)}
                >
                  <SelectTrigger className="h-9 w-full" aria-label="Filtrer par taille">
                    <SelectValue placeholder="Toutes les tailles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*">Toutes les tailles</SelectItem>
                    {[...toutesTailles].sort().map((t) => (
                      <SelectItem key={t} value={t}>
                        {t} — {tailleLabel(t)[0]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Compteur de résultats */}
              <div className="flex items-end pb-1 text-xs text-muted-foreground">
                {resultatsRecherche.length.toLocaleString("fr-FR")} référence(s)
                trouvée(s)
                {resultatsRecherche.length > MAX_RESULTATS_RECHERCHE &&
                  ` — ${MAX_RESULTATS_RECHERCHE} premières affichées`}
              </div>
            </div>

            {/* Résultats (clic = remplissage automatique du formulaire) */}
            {resultatsRecherche.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed py-6 text-center">
                <Search className="h-6 w-6 text-zinc-300 dark:text-zinc-600" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Aucune référence ne correspond à ces critères.
                </p>
              </div>
            ) : (
              <div className="scroll-shadows max-h-72 overflow-y-auto rounded-lg border">
                <ul className="divide-y">
                  {resultatsAffiches.map((r, i) => (
                    <li
                      key={`${r[0]}-${r[1]}-${r[2]}-${r[4]}-${i}`}
                      className="group/result"
                    >
                      <button
                        type="button"
                        onClick={() => appliquerResultatRecherche(r)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-amber-50 focus-visible:bg-amber-50 dark:hover:bg-amber-950/30 dark:focus-visible:bg-amber-950/30"
                        aria-label={`Utiliser ${r[0]}, ${r[1]}, ${r[2]}`}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {r[0]} · {r[1]}
                            {r[3] ? ` · ${mancheLabel(r[3])?.[0] ?? r[3]}` : ""}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {r[4]}
                          </span>
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 font-mono text-[11px]"
                        >
                          {r[2]} — {tailleLabel(r[2])[0]}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog : préférences d'imprimante (cible intégrée aux .NLBL) */}
      <Dialog open={dialogImprimante} onOpenChange={setDialogImprimante}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Préférences d&apos;imprimante
            </DialogTitle>
            <DialogDescription>
              Choisit l&apos;imprimante cible intégrée aux fichiers .NLBL. Seuls les
              réglages d&apos;impression changent — le design du modèle n&apos;est jamais
              modifié.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-zinc-50 p-3 dark:bg-zinc-900/50">
              <div className="min-w-0">
                <Label htmlFor="prefs-imprimante" className="text-sm font-medium">
                  Personnaliser l&apos;imprimante
                </Label>
                <p className="text-xs text-muted-foreground">
                  Sinon, le fichier cible « ZDesigner GK420d » (valeur du modèle).
                </p>
              </div>
              <Switch
                id="prefs-imprimante"
                checked={prefsImprimante.active}
                onCheckedChange={(v) =>
                  setPrefsImprimante((p) => ({ ...p, active: v }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nom-imprimante">
                Nom de l&apos;imprimante (nom exact Windows)
              </Label>
              <Input
                id="nom-imprimante"
                value={prefsImprimante.nom}
                onChange={(e) =>
                  setPrefsImprimante((p) => ({ ...p, nom: e.target.value }))
                }
                placeholder="ex. ZDesigner GK420d"
                disabled={!prefsImprimante.active}
                maxLength={64}
                list="imprimantes-courantes"
                className="h-10 font-mono text-sm"
                autoComplete="off"
              />
              <datalist id="imprimantes-courantes">
                <option value="ZDesigner GK420d" />
                <option value="ZDesigner GK420t" />
                <option value="ZDesigner GX430t" />
                <option value="ZDesigner ZD420-203dpi ZPL" />
                <option value="ZDesigner ZD621-203dpi ZPL" />
                <option value="ZDesigner ZP 450-200dpi" />
              </datalist>
              <p className="text-xs text-muted-foreground">
                Si l&apos;imprimante n&apos;existe pas sur le poste, Zebra Designer
                proposera d&apos;en choisir une autre à l&apos;ouverture du fichier.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dpi-imprimante">Résolution (dpi) — rappel</Label>
              <Select
                value={prefsImprimante.dpi}
                onValueChange={(v) => setPrefsImprimante((p) => ({ ...p, dpi: v }))}
                disabled={!prefsImprimante.active}
              >
                <SelectTrigger id="dpi-imprimante" className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="203">203 dpi — séries GK / ZP</SelectItem>
                  <SelectItem value="300">300 dpi — GX430t / ZD621-300</SelectItem>
                  <SelectItem value="600">600 dpi — ZD621-600</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                À régler au moment de l&apos;impression dans Zebra Designer ;
                mémorisé ici comme rappel (n&apos;affecte pas le fichier).
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setDialogImprimante(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={enregistrerPrefsImprimante}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog : contenu exact du fichier .NLBL (vérification avant impression) */}
      <Dialog open={dialogApercuFichier} onOpenChange={setDialogApercuFichier}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Contenu du fichier .NLBL
            </DialogTitle>
            <DialogDescription>
              Aperçu exact de ce que contiendra le fichier téléchargé : entrées de
              l&apos;archive, variables intégrées et XML de la solution.
            </DialogDescription>
          </DialogHeader>
          {apercuFichier && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-lg border bg-zinc-50 p-2.5 dark:bg-zinc-900/50">
                  <p className="font-medium text-zinc-500 dark:text-zinc-400">Entrées de l&apos;archive</p>
                  <p className="mt-0.5 font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
                    {apercuFichier.entrees.length}
                  </p>
                </div>
                <div className="rounded-lg border bg-zinc-50 p-2.5 dark:bg-zinc-900/50">
                  <p className="font-medium text-zinc-500 dark:text-zinc-400">Chiffrement</p>
                  <p className="mt-0.5 font-mono text-sm text-zinc-900 dark:text-zinc-100">AES-256</p>
                </div>
                <div className="rounded-lg border bg-zinc-50 p-2.5 dark:bg-zinc-900/50">
                  <p className="font-medium text-zinc-500 dark:text-zinc-400">Taille estimée</p>
                  <p className="mt-0.5 font-mono text-sm tabular-nums text-zinc-900 dark:text-zinc-100">
                    {apercuFichier.tailleOctets.toLocaleString("fr-FR")} o
                  </p>
                </div>
                <div className="rounded-lg border bg-zinc-50 p-2.5 dark:bg-zinc-900/50">
                  <p className="font-medium text-zinc-500 dark:text-zinc-400">Imprimante cible</p>
                  <p className="mt-0.5 truncate font-mono text-sm text-zinc-900 dark:text-zinc-100" title={apercuFichier.imprimante}>
                    {apercuFichier.imprimante}
                  </p>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Variables qui seront intégrées au fichier .NLBL
                  </caption>
                  <tbody className="divide-y">
                    {apercuFichier.variables.map((v) => (
                      <tr key={v.nom} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <th
                          scope="row"
                          className="w-24 bg-zinc-50 px-3 py-1.5 text-left font-medium text-zinc-600 dark:bg-zinc-900/60 dark:text-zinc-300"
                        >
                          {v.nom}
                        </th>
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {v.valeur || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="group rounded-lg border">
                <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-xs font-medium text-zinc-600 hover:text-amber-800 dark:text-zinc-300 dark:hover:text-amber-400">
                  XML de la solution (variables intégrées, tel que lu par Zebra
                  Designer)
                  <span
                    className="text-[10px] text-zinc-400 group-open:hidden"
                    aria-hidden="true"
                  >
                    afficher ▾
                  </span>
                  <span className="hidden text-[10px] text-zinc-400 group-open:inline" aria-hidden="true">
                    masquer ▴
                  </span>
                </summary>
                <pre
                  className="max-h-80 overflow-auto bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-200 scrollbar-thin scrollbar-thumb-zinc-700"
                  aria-label="XML de la solution .NLBL"
                >
                  {apercuFichier.xmlSolution}
                </pre>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog : mode d'emploi intégré */}
      <Dialog open={dialogAide} onOpenChange={setDialogAide}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mode d&apos;emploi</DialogTitle>
            <DialogDescription>
              Impression directe avec Zebra Designer Essentials 3 — plus aucun
              import de fichier texte.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {[
              {
                titre: "Étiquette simple (.NLBL)",
                texte:
                  "Complétez le formulaire (article, couleur, manche, taille, OF, type), puis cliquez sur « Générer le fichier .NLBL » (ou Ctrl + ⏎). Ouvrez le fichier téléchargé dans Zebra Designer : les données sont déjà intégrées — réglez la quantité et imprimez.",
              },
              {
                titre: "Lot d'étiquettes (.zip)",
                texte:
                  "Ajoutez chaque référence à la file d'impression (jusqu'à 100), puis « Générer le lot ». Vous obtenez une archive .zip contenant un fichier .nlbl par étiquette (+ LISEZMOI.txt) : chaque fichier s'ouvre directement avec ses données.",
              },
              {
                titre: "Imprimante cible",
                texte:
                  "Le fichier est réglé sur « ZDesigner GK420d » par défaut. Pour viser une autre imprimante, ouvrez les préférences (icône engrenage) : le nom saisi sera intégré au .NLBL sans toucher au design.",
              },
              {
                titre: "Scan douchette",
                texte:
                  "Cliquez dans le champ « Scannez un code-barres » de la file d'impression, puis scannez vos références : chaque code EAN-13 reconnu est ajouté à la file avec l'OF et le type du formulaire. Restez sur le champ pour enchaîner les scans.",
              },
              {
                titre: "Ancien flux (.TXT)",
                texte:
                  "Le bouton « Exporter le fichier .TXT » conserve le flux historique : format Clé=valeur à charger manuellement via « Charger… » dans Zebra Designer. Le bouton « Importer un .TXT » fait l'inverse : un ancien export est rechargé dans la file pour le réimprimer en .NLBL. Vous pouvez aussi glisser-déposer le fichier directement sur la carte « File d'impression ».",
              },
              {
                titre: "Régénérer depuis le journal",
                texte:
                  "Survolez une entrée .NLBL du journal et cliquez sur la flèche circulaire : ses étiquettes sont remises dans la file d'impression, prêtes à être régénérées (fonctionne sur les générations récentes).",
              },
              {
                titre: "Colisage (codes scannés)",
                texte:
                  "Basculez sur l'espace « Colisage » en haut de page, collez vos 3 000 à 4 000 codes-barres scannés (ou importez un fichier .txt/.csv), puis « Générer le colisage » : les lignes sont regroupées automatiquement par OF, modèle, couleur et taille, avec les quantités. Export CSV pour Excel, codes inconnus signalés sans bloquer le résultat.",
              },
              {
                titre: "Filtrer le journal par période",
                texte:
                  "Dans « Dernières générations », choisissez une période (Aujourd'hui, 7 ou 30 jours) ou « Dates… » pour une plage personnalisée. Le filtre s'applique côté serveur : pagination et export CSV suivent la période choisie.",
              },
            ].map((etape, i) => (
              <div key={etape.titre} className="flex gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{etape.titre}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {etape.texte}
                  </p>
                </div>
              </div>
            ))}
            {/* Raccourcis clavier disponibles partout dans l'application */}
            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Keyboard className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                Raccourcis clavier
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                {[
                  ["Générer le fichier .NLBL", "Ctrl + ⏎"],
                  ["Recherche avancée dans le catalogue", "Ctrl + K"],
                  ["Ajouter l'étiquette courante à la file", "Ctrl + M"],
                ].map(([action, touches]) => (
                  <li key={touches} className="flex items-center justify-between gap-2">
                    <span>{action}</span>
                    <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                      {touches}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-semibold">Bon à savoir</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>
                  Les accents et caractères spéciaux sont correctement encodés
                  (UTF-8, échappement XML).
                </li>
                <li>
                  Pour N copies de la même étiquette, un seul fichier suffit :
                  réglez « Nombre d&apos;étiquettes » dans Zebra Designer.
                </li>
                <li>
                  Un doublon strict (les 7 variables identiques) ne duplique pas
                  la file : sa quantité est augmentée — pratique en scan
                  continu ; deux étiquettes de même modèle mais de couleurs ou
                  tailles différentes restent des lignes distinctes.
                </li>
                <li>
                  Mémorisez la file avec « Mémoriser le lot » pour recharger un
                  groupe d'étiquettes en un clic.
                </li>
                <li>
                  Les fichiers .TXT importés doivent contenir un code-barres
                  EAN-13 valide ; les codes SPE (préfixe 99) ne sont pas
                  scannables.
                </li>
                <li>
                  Le journal peut être sauvegardé en JSON et restauré à tout
                  moment (les doublons sont ignorés) ; export CSV également
                  disponible, limité à la période sélectionnée le cas échéant.
                </li>
                <li>
                  Le filtre « Période » du journal s’applique côté serveur : la
                  pagination « Charger plus » et l’export CSV respectent la
                  plage choisie (fuseau Europe/Paris).
                </li>
                <li>
                  Le journal et les statistiques se rafraîchissent après chaque
                  génération.
                </li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog : confirmation de suppression d'une entrée du journal */}
      <AlertDialog
        open={suppressionCible !== null}
        onOpenChange={(ouvert) => !ouvert && setSuppressionCible(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette entrée du journal ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;entrée « {suppressionCible?.filename} » sera définitivement retirée
              de l&apos;historique et des statistiques. Les fichiers déjà téléchargés
              ne sont pas affectés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={suppressionEnCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={suppressionEnCours}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault(); // laisse le dialog ouvert pendant la requête
                supprimerEntreeJournal();
              }}
            >
              {suppressionEnCours ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {suppressionEnCours ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog : confirmation de la purge complète du journal */}
      <AlertDialog
        open={purgeOuverte}
        onOpenChange={(ouvert) => !purgeEnCours && setPurgeOuverte(ouvert)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vider tout le journal ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les {historiqueTotal.toLocaleString("fr-FR")} entrées du journal seront
              définitivement supprimées : l&apos;historique et les statistiques
              repartiront de zéro. Les fichiers déjà téléchargés ne sont pas
              affectés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeEnCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={purgeEnCours}
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault(); // laisse le dialog ouvert pendant la requête
                purgerJournal();
              }}
            >
              {purgeEnCours ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Eraser className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {purgeEnCours ? "Suppression…" : "Tout effacer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog : mémorisation du lot courant (préset de file d'impression) */}
      <Dialog open={dialogLot} onOpenChange={setDialogLot}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Mémoriser ce lot
            </DialogTitle>
            <DialogDescription>
              Enregistrez la file d&apos;impression ({fileAttente.length} étiquette
              {fileAttente.length > 1 ? "s" : ""}, {totalCopiesFile} copie
              {totalCopiesFile > 1 ? "s" : ""}) pour la recharger en un clic plus
              tard — mémorisé sur ce poste.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nom-lot">Nom du lot</Label>
            <Input
              id="nom-lot"
              value={nomLot}
              onChange={(e) => setNomLot(e.target.value)}
              maxLength={40}
              placeholder="ex. Réassort boutique T1"
              className="h-10"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  memoriserLot();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Maximum {MAX_LOTS} lots mémorisés — les quantités de chaque ligne sont
              conservées.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialogLot(false)}>
              Annuler
            </Button>
            <Button
              onClick={memoriserLot}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Mémoriser
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog : confirmation du remplacement de la file par un lot mémorisé */}
      <AlertDialog
        open={lotACharger !== null}
        onOpenChange={(ouvert) => !ouvert && setLotACharger(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remplacer la file d&apos;impression ?</AlertDialogTitle>
            <AlertDialogDescription>
              La file actuelle ({fileAttente.length} étiquette
              {fileAttente.length > 1 ? "s" : ""}) sera remplacée par «{" "}
              {lotACharger?.nom} » ({lotACharger?.lignes.length ?? 0} étiquette
              {lotACharger && lotACharger.lignes.length > 1 ? "s" : ""}), avec les
              quantités mémorisées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                if (lotACharger) appliquerLot(lotACharger);
                setLotACharger(null);
              }}
            >
              <BookmarkPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              Remplacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog : confirmation de la restauration d'une sauvegarde JSON */}
      <AlertDialog
        open={restaurationEnAttente !== null}
        onOpenChange={(ouvert) => !restaurationEnCours && !ouvert && setRestaurationEnAttente(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurer cette sauvegarde ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le fichier « {restaurationEnAttente?.nomFichier} » contient{" "}
              {restaurationEnAttente
                ? restaurationEnAttente.entrees.length.toLocaleString("fr-FR")
                : 0}{" "}
              entrée(s). Les entrées déjà présentes dans le journal seront ignorées
              automatiquement (aucun doublon) ; les fichiers déjà téléchargés ne
              sont pas affectés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restaurationEnCours}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={restaurationEnCours}
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault(); // laisse le dialog ouvert pendant la requête
                confirmerRestauration();
              }}
            >
              {restaurationEnCours ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FolderUp className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {restaurationEnCours ? "Restauration…" : "Restaurer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Champ fichier caché : sélection d'une sauvegarde JSON à restaurer */}
      <input
        ref={fichierRestaurationRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={gestionFichierRestauration}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Pied de page collant */}
      <footer className="mt-auto bg-zinc-900 pb-[env(safe-area-inset-bottom)] text-zinc-400">
        <div
          className="h-px w-full bg-gradient-to-r from-transparent via-amber-500/60 to-transparent"
          aria-hidden="true"
        />
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
          <span>Clément Design — Étiquettes &amp; colisage</span>
          <span>
            Étiquettes .NLBL à données intégrées · Colisage par scan ·
            Imprimante cible :{" "}
            <strong className="font-semibold text-zinc-200">
              {imprimanteCible ?? "ZDesigner GK420d"}
            </strong>
            {prefsImprimante.active && prefsImprimante.dpi &&
              ` · ${prefsImprimante.dpi} dpi`}
          </span>
        </div>
      </footer>
    </div>
  );
}
