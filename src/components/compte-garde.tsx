"use client";

/**
 * Garde des comptes — Clément Design, Étiquettes & colisage.
 *
 * Trois responsabilités, entièrement transparentes pour le reste de la page :
 *  1. Fournit le contexte de session (compte connecté) à toute l'application
 *     via le hook `useCompte()` ;
 *  2. Si des comptes existent (cloud.config.json) et que personne n'est
 *     connecté, affiche l'écran de connexion élégant à la place de l'app ;
 *  3. `BadgeCompte` : petite pastille d'en-tête (identité + déconnexion).
 *
 * Si AUCUN compte n'est configuré (installation historique), l'application
 * s'affiche directement : zéro régression.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Building2,
  Factory,
  Loader2,
  LogOut,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ---------------------------------------------------------------------------
// Types + contexte
// ---------------------------------------------------------------------------

export interface ComptePublic {
  identifiant: string;
  nom: string;
  role: "faconnier" | "france";
  siteId: string;
  siteLabel: string;
}

interface ReponseAuth {
  authActive: boolean;
  erreurConfig: string | null;
  compte: ComptePublic | null;
  comptes: ComptePublic[];
}

interface CompteContexte {
  charge: boolean;
  authActive: boolean;
  erreurConfig: string | null;
  compte: ComptePublic | null;
  comptes: ComptePublic[];
  rafraichir: () => Promise<void>;
  deconnecter: () => Promise<void>;
}

const Ctx = createContext<CompteContexte | null>(null);

/** Hook d'accès à la session (compte connecté, rôle, site). */
export function useCompte(): CompteContexte {
  const valeur = useContext(Ctx);
  if (!valeur) {
    // Défaut sûr si utilisé hors provider (ne doit pas arriver).
    return {
      charge: true,
      authActive: false,
      erreurConfig: null,
      compte: null,
      comptes: [],
      rafraichir: async () => {},
      deconnecter: async () => {},
    };
  }
  return valeur;
}

// ---------------------------------------------------------------------------
// Provider + garde
// ---------------------------------------------------------------------------

export function CompteGarde({ children }: { children: React.ReactNode }) {
  const [etat, setEtat] = useState<ReponseAuth | null>(null);
  const [erreurReseau, setErreurReseau] = useState<string | null>(null);

  const rafraichir = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/compte", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ReponseAuth;
      setEtat(data);
      setErreurReseau(null);
    } catch (e) {
      setErreurReseau(e instanceof Error ? e.message : "Erreur inconnue.");
    }
  }, []);

  const deconnecter = useCallback(async () => {
    try {
      await fetch("/api/auth/compte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } finally {
      await rafraichir();
    }
  }, [rafraichir]);

  useEffect(() => {
    void rafraichir();
  }, [rafraichir]);

  const contexte = useMemo<CompteContexte>(
    () => ({
      charge: etat === null,
      authActive: etat?.authActive ?? false,
      erreurConfig: etat?.erreurConfig ?? null,
      compte: etat?.compte ?? null,
      comptes: etat?.comptes ?? [],
      rafraichir,
      deconnecter,
    }),
    [etat, rafraichir, deconnecter]
  );

  return <Ctx.Provider value={contexte}>{rendre(children, contexte, erreurReseau)}</Ctx.Provider>;
}

/** Décide de l'écran : écluse (chargement) / connexion / application. */
function rendre(
  children: React.ReactNode,
  ctx: CompteContexte,
  erreurReseau: string | null
) {
  // Lecture de l'état d'authentification en cours : écluse discrète pour
  // éviter un flash de l'application avant l'écran de connexion.
  if (ctx.charge) return <Ecluse chargement erreurReseau={erreurReseau} />;
  // Auth active + personne connecté → écran de connexion.
  if (ctx.authActive && !ctx.compte) return <EcranConnexion />;
  // Sinon (pas d'auth, ou déjà connecté) → application normale.
  return <>{children}</>;
}

/** Écluse de chargement (logo + pastille). */
function Ecluse({
  chargement,
  erreurReseau,
}: {
  chargement: boolean;
  erreurReseau: string | null;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-100 p-6 dark:bg-zinc-950">
      <img
        src="/logo-clement.png"
        alt="Clément Design"
        className="h-8 w-auto dark:hidden"
        width={272}
        height={32}
      />
      <img
        src="/logo-clement-blanc.png"
        alt="Clément Design"
        className="hidden h-8 w-auto dark:block"
        width={272}
        height={32}
      />
      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Ouverture de l&apos;espace de travail…
        </div>
      ) : (
        erreurReseau && (
          <div className="max-w-sm rounded-md border border-red-300 bg-red-50 p-3 text-center text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-300">
            Connexion au serveur impossible ({erreurReseau}).{" "}
            <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
              Réessayer
            </Button>
          </div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Écran de connexion
// ---------------------------------------------------------------------------

/** Écran de connexion : choisir son compte, saisir son code. */
export function EcranConnexion() {
  const { comptes, rafraichir, erreurConfig } = useCompte();
  const [choisi, setChoisi] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const compteChoisi = comptes.find((c) => c.identifiant === choisi) ?? null;

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault();
    if (!choisi || !code.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/auth/compte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", identifiant: choisi, code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErreur(data.error ?? "Connexion impossible.");
        return;
      }
      await rafraichir();
    } catch {
      setErreur("Connexion au serveur impossible. Vérifiez le réseau.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
      <div className="w-full max-w-md">
        {/* Logo + titre */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img
            src="/logo-clement.png"
            alt="Clément Design — Le Couturier des Cuisiniers"
            className="h-9 w-auto dark:hidden"
            width={272}
            height={32}
          />
          <img
            src="/logo-clement-blanc.png"
            alt="Clément Design — Le Couturier des Cuisiniers"
            className="hidden h-9 w-auto dark:block"
            width={272}
            height={32}
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Espace de travail sécurisé
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Identifiez-vous : votre production (étiquettes, impressions,
              colisage) sera signée de votre nom dans la base partagée.
            </p>
          </div>
        </div>

        {/* Alerte si cloud.config.json illisible */}
        {erreurConfig && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <span className="font-semibold">Configuration :</span> {erreurConfig}
          </div>
        )}

        <form
          onSubmit={(e) => void seConnecter(e)}
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              1. Votre compte
            </legend>
            <div className="grid gap-2" role="radiogroup" aria-label="Choisir le compte">
              {comptes.map((c) => {
                const actif = c.identifiant === choisi;
                const Icone = c.role === "france" ? Building2 : Factory;
                return (
                  <button
                    key={c.identifiant}
                    type="button"
                    role="radio"
                    aria-checked={actif}
                    onClick={() => setChoisi(c.identifiant)}
                    className={`flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      actif
                        ? "border-amber-500 bg-amber-50 ring-1 ring-amber-500 dark:bg-amber-950/40"
                        : "border-zinc-200 bg-white hover:border-amber-300 hover:bg-amber-50/50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-amber-950/20"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        actif
                          ? "bg-amber-600 text-white"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      <Icone className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {c.nom}
                      </span>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {c.role === "france"
                          ? "France — réception, colisage, génération"
                          : "Façonnier — génération d'étiquettes"}
                      </span>
                    </span>
                    {actif && <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mb-4 grid gap-1.5">
            <Label htmlFor="compte-code" className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              2. Votre code d&apos;accès
            </Label>
            <Input
              id="compte-code"
              type="password"
              inputMode="text"
              autoComplete="current-password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={compteChoisi ? `Code de ${compteChoisi.nom}…` : "Choisissez d'abord un compte"}
              disabled={!choisi || enCours}
              className="h-11"
              autoFocus
            />
          </div>

          {erreur && (
            <p
              role="alert"
              className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-300"
            >
              {erreur}
            </p>
          )}

          <Button
            type="submit"
            disabled={!choisi || !code.trim() || enCours}
            className="h-11 w-full bg-amber-600 text-base font-semibold text-white hover:bg-amber-700"
          >
            {enCours ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            )}
            Se connecter
          </Button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-600">
          Les accès sont créés et gérés par Clément Design (fichier
          cloud.config.json sur le serveur). Oubli de code : contactez Clément.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge d'en-tête (identité + déconnexion)
// ---------------------------------------------------------------------------

/** Pastille d'en-tête : compte connecté + bouton de déconnexion. */
export function BadgeCompte() {
  const { authActive, compte, deconnecter } = useCompte();
  const [enCours, setEnCours] = useState(false);
  if (!authActive || !compte) return null;

  const Icone = compte.role === "france" ? Building2 : Factory;

  return (
    <div
      className="flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/80 py-1 pl-2.5 pr-1 text-white"
      title={`${compte.nom} — ${compte.siteLabel}`}
    >
      <Icone
        className={`h-3.5 w-3.5 shrink-0 ${compte.role === "france" ? "text-emerald-400" : "text-amber-400"}`}
        aria-hidden="true"
      />
      <span className="max-w-[9rem] truncate text-xs font-semibold sm:max-w-[12rem]">
        {compte.nom}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Se déconnecter du compte ${compte.nom}`}
            disabled={enCours}
            onClick={() => {
              setEnCours(true);
              void deconnecter().finally(() => setEnCours(false));
            }}
            className="h-6 w-6 rounded-full text-zinc-400 hover:bg-zinc-700 hover:text-white"
          >
            {enCours ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-3 w-3" aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Se déconnecter ({compte.siteLabel})</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
