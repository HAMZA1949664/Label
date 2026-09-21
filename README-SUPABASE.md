# Base de données — persistance locale + cloud Supabase multi-sites

## 🔐 Comptes et fichier de configuration (cloud.config.json)

**La connexion Supabase et les comptes se gèrent dans UN SEUL FICHIER :**
[`cloud.config.json`](cloud.config.json) à la racine du projet (côté serveur —
jamais envoyé au navigateur, les façonniers ne peuvent ni le voir ni le
modifier). Il contient :

| Champ | Rôle |
| ----- | ---- |
| `supabaseUrl` | Adresse du projet Supabase (déjà remplie) |
| `supabaseCle` | Clé API du projet (`sb_publishable_…` ou `service_role`) — déjà remplie |
| `secretSession` | Phrase secrète des sessions (la changer déconnecte tout le monde) |
| `comptes[]` | Accès : `identifiant`, `code`, `nom`, `role`, `siteId`, `siteLabel` |

**Les 3 comptes livrés** (codes par défaut à changer dans le fichier) :

| Identifiant | Code par défaut | Rôle | Ce que le compte peut faire |
| ----------- | --------------- | ---- | --------------------------- |
| `archipel` | `archipel2025` | façonnier | Génération + impression d'étiquettes, synchronisation cloud, journal des sites |
| `nastex` | `nastex2025` | façonnier | idem |
| `clement` | `clement2025` | france | Tout : génération + **réception + colisage** |

- Chaque étiquette, impression, réception ou scan est **signé du compte
  connecté** dans la base partagée : « Tunisie — Archipel », « Tunisie —
  Nastex », « France — Clément Design (Carros) ».
- L'espace **Colisage** est masqué pour les comptes façonniers (interface ET
  API) : la réception est réalisée par la France.
- Pour ajouter un compte ou changer un code : Clément édite `cloud.config.json`
  (effet immédiat, sans redéploiement — relecture toutes les 5 secondes).

## ✅ Ce qui est déjà enregistré en base (dès maintenant)

L'application est **déjà connectée à une vraie base de données** (Prisma ORM).
Chaque action y est persistée :

| Donnée | Modèle | Contenu |
| ------ | ------ | ------- |
| **Étiquettes générées** | `LabelRecord` | 1 ligne par étiquette produite (simple ou lot .zip) : code-barres **FAB** (catalogue) ou **SPE** (préfixe 99), OF, modèle, couleur, taille, manche, type, copies demandées, fichier produit, date |
| **Réceptions prévues** | `Reception` + `ReceptionLine` | Le lot attendu du façonnier : lignes OF → modèle → couleur → taille avec quantités attendues, statut ouverte/clôturée |
| **Scans pointés** | `ScanRecord` | Codes scannés pointés sur une réception, **cumulés session après session** (quantité par code) |
| **Journal des générations** | `GenerationLog` | Historique des exports .NLBL / .TXT (déjà existant) |
| **Catalogue stock** | `Article` | 4 623 références [article, couleur, taille, manche, code-barres] |

Conséquences concrètes :
- **Chaque étiquette générée est enregistrée** — le code FAB/SPE imprimé pour
  le façonnier est mémorisé avec son OF, même des semaines plus tard.
- **Le colisage décode les codes SPE depuis la base** (plus de recalcul).
- **Le colisage compare au prévu** : sélectionnez la réception de la semaine,
  pointez les scans, consultez *attendu / reçu / écart* ligne par ligne
  (manquants, excédents, pièces hors prévue), taux de réception en %.
- Le pointage est **idempotent par code et cumulatif entre sessions** :
  re-scanner un code plus tard ajoute ses nouvelles occurrences.

## ☁️ Connexion Supabase (déjà configurée pour cette installation)

### Pourquoi

Les 2 façonniers sont en Tunisie, Clément Design en France. La base cloud
partagée fait converger toutes les données au même endroit :

- **Chaque étiquette générée** (code FAB du stock ou code SPE calculé) →
  enregistrée dans Supabase, signée du site qui l'a produite.
- **Chaque impression** (fichier .NLBL simple, lot .zip, export .TXT) →
  enregistrée dans Supabase (événement d'impression).
- **Réceptions prévues, lignes attendues, pointages de scans** → également
  partagés dans la base.
- **Journal des sites** (bouton Cloud → onglet dédié) : la France voit ce que
  chaque façonnier a imprimé, et réciproquement — le socle du flux W-1
  (imprimé la semaine N → réceptionné la semaine N+1).

### Mise en route (résumé)

1. **Créez le projet** sur [supabase.com](https://supabase.com) (offre
   gratuite suffisante ; région Europe de l'Ouest conseillée).
2. **SQL Editor → New query** : collez le script
   [`public/supabase-schema.sql`](public/supabase-schema.sql) (aussi copiable
   en un clic depuis l'onglet **Guide** du bouton Cloud) → **Run**. Il crée 5
   tables : `label_generations`, `print_events`, `receptions`,
   `reception_lines`, `scan_records` (+ les droits d'accès pour la clé API).
3. **Project Settings → API** : copiez *Project URL* et la clé API
   (`sb_publishable_…` ou `service_role`) → collez-les dans
   `cloud.config.json` (`supabaseUrl` / `supabaseCle`). C'est tout :
   l'application est connectée, les façonniers n'ont rien à faire.
4. Les utilisateurs se connectent avec **leur compte** (Archipel, Nastex,
   Clément — Carros) : leur site est automatiquement attaché à chaque
   événement.

> L'onglet « Connexion » du bouton Cloud affiche « Connexion définie par le
> fichier cloud.config.json » tant que le fichier fournit l'URL et la clé :
> il est verrouillé par conception (les façonniers ne peuvent pas changer la
> base). Pour revenir à la saisie manuelle, videz `supabaseUrl` ou
> `supabaseCle` dans le fichier.

### Architecture « miroir convergent » (tolérante aux coupures)

- La base locale (SQLite) reste le magasin de travail : **aucune régression**,
  tout continue de fonctionner même sans Internet.
- Chaque événement est d'abord empilé dans une **file d'attente locale** puis
  poussé vers Supabase (API REST PostgREST, clé API côté serveur uniquement,
  lue dans cloud.config.json). Coupure Internet → les événements **restent en
  file** et partent automatiquement dès le retour du réseau (reprise toutes
  les 30 s, ou bouton « Synchroniser maintenant »).
- **Idempotence garantie** par la clé unique `(site_id, local_id)` côté cloud :
  rejouer la file ne crée jamais de doublons.
- La clé n'est **jamais** renvoyée au navigateur ; les erreurs de connexion
  sont traduites en causes actionnables (clé refusée, script SQL manquant,
  URL injoignable).

### Vue d'ensemble

```
France — Clément Design (Carros) ─┐
Tunisie — Archipel              ──┼──►  Base Supabase partagée (Postgres)
Tunisie — Nastex                ──┘      label_generations · print_events
                                         receptions · reception_lines · scan_records
```

## 🌍 Passer en accès multi-utilisateurs complet (déploiement en ligne)

En local, chaque site consulte les autres **via la base cloud** (onglet
« Journal des sites »). Pour que les façonniers utilisent l'application
directement dans leur navigateur sans installation :

1. Déployez l'application (Vercel, VPS…) — c'est une app Next.js standard.
2. Basculez la base principale sur Supabase (PostgreSQL) :

   ```env
   # .env (serveur déployé)
   DATABASE_URL="postgresql://postgres.<ref>:<mot-de-passe>@aws-0-eu-west-3.pooler.supabase.com:6543/postgres"
   ```

   ```prisma
   datasource db {
     provider = "postgresql"   // était : "sqlite"
     url      = env("DATABASE_URL")
   }
   ```

3. `bun run db:push` puis réimportez le catalogue (`prisma/articles_seed.json`
   — script d'import sur demande).
4. Un seul déploiement + une seule base : tout le monde travaille alors sur la
   même donnée en direct, et le miroir décrit ci-dessus devient inutile.

> 💡 Les données de la base SQLite locale (étiquettes déjà générées,
> réceptions, journal) peuvent être migrées vers Supabase : `prisma db pull`
> sur SQLite → `prisma migrate diff` pour générer le SQL d'insertion, ou un
> simple script de copie table à table (à demander).

## 🧭 Flux logistique couvert (façonnier / W-1)

```
Semaine N       Le façonnier (Tunisie) imprime les étiquettes .NLBL
                └─ chaque étiquette → base locale + base cloud (signée du site)

Semaine N       Clément Design consulte « Journal des sites » (bouton Cloud)
                et crée la « Réception prévue » depuis les étiquettes de la
                semaine (par OF ou par période lundi → dimanche)

Semaine N+1     Réception physique en France : scan des codes-barres → colisage
                └─ bouton « Pointer les N scans » → comparaison attendu/reçu
                   (manquants, excédents, hors prévue, taux %)

Fin de réception  Clôture : pointage verrouillé, état figé, export CSV
```
