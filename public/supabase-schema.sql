-- ============================================================================
-- Clément Design — Étiquettes & colisage
-- Schéma de la base cloud Supabase (PostgreSQL)
--
-- MODE D'EMPLOI (5 minutes) :
--   1. Projet créé sur https://supabase.com (région Europe de l'Ouest
--      conseillée, ex. Paris / Francfort).
--   2. Menu « SQL Editor » → « New query » → collez CE SCRIPT ENTIER → « Run ».
--      → 5 tables sont créées : label_generations, print_events, receptions,
--        reception_lines, scan_records.
--   3. L'application est DÉJÀ connectée : l'URL et la clé API sont enregistrées
--      dans le fichier cloud.config.json à la racine du projet (géré par
--      Clément Design). Les façonniers n'ont rien à saisir ni à modifier.
--   4. Chaque utilisateur ouvre le site et se connecte avec son compte :
--        - Archipel          (Tunisie — façonnier : génération d'étiquettes) ;
--        - Nastex            (Tunisie — façonnier : génération d'étiquettes) ;
--        - Clément — Carros  (France — réception, colisage, génération).
--      Tous les événements sont signés du site correspondant dans la base.
--
-- NOTES D'INGÉNIERIE :
--   - Chaque table porte une clé d'idempotence (site_id, local_id) : les
--     re-synchronisations (réseau instable, file d'attente rejouée) ne
--     créent JAMAIS de doublons — le cloud est un miroir convergent.
--   - La clé API du projet (sb_publishable_… ou service_role) n'est utilisée
--     que par le SERVEUR de l'application : ne la communiquez ni aux
--     façonniers ni à des tiers. RLS volontairement non activée + droits
--     explicites ci-dessous : l'écriture passe par la clé du serveur.
--   - local_id = identifiant local de l'application (cuid/uuid) ;
--     site_id = identifiant du site producteur (france-hq, tn-archipel,
--     tn-nastex…).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Étiquettes générées (mémoire permanente des codes FAB et SPE)
--    1 ligne = 1 étiquette produite (copies comprises dans quantite).
-- ---------------------------------------------------------------------------
create table if not exists public.label_generations (
  id           bigserial primary key,
  site_id      text        not null,
  site_label   text        not null default '',
  local_id     text        not null,
  code_barre   text        not null,            -- EAN-13 (FAB ou SPE 99…)
  article      text        not null default '', -- modèle de base (ex. SFAX)
  modele       text        not null default '', -- modèle complet (ex. SFAX MC / ADDICT MC SPE)
  couleur      text        not null default '', -- libellé français
  couleur_code text        not null default '', -- code stock (BLC, NOIR…)
  taille       text        not null default '', -- taille compacte FR (T46, XS…)
  manche       text        not null default '',
  of           text        not null default '', -- n° d'OF ('' si absent)
  type         text        not null default '', -- type produit (Veste, Tablier…)
  source       text        not null default 'FAB', -- FAB | SPE | EXT
  quantite     integer     not null default 1,  -- copies demandées
  filename     text        not null default '', -- fichier .nlbl / .zip produit
  genere_at    timestamptz not null default now(),
  unique (site_id, local_id)
);

create index if not exists idx_label_gen_site_date  on public.label_generations (site_id, genere_at desc);
create index if not exists idx_label_gen_of         on public.label_generations (of);
create index if not exists idx_label_gen_code_barre on public.label_generations (code_barre);

-- ---------------------------------------------------------------------------
-- 2. Événements d'impression / génération de fichier (journal partagé)
--    1 ligne = 1 lot téléchargé (.NLBL simple, lot .zip ou export .TXT).
-- ---------------------------------------------------------------------------
create table if not exists public.print_events (
  id           bigserial primary key,
  site_id      text        not null,
  site_label   text        not null default '',
  local_id     text        not null,
  kind         text        not null default 'NLBL', -- NLBL | TXT
  filename     text        not null default '',
  labels_count integer     not null default 0,
  details      text,                                -- résumé JSON (tronqué)
  event_at     timestamptz not null default now(),
  unique (site_id, local_id)
);

create index if not exists idx_print_events_site_date on public.print_events (site_id, event_at desc);

-- ---------------------------------------------------------------------------
-- 3. Réceptions prévues (flux W-1 : imprimé la semaine N par le façonnier,
--    réceptionné la semaine N+1 par Clément Design)
-- ---------------------------------------------------------------------------
create table if not exists public.receptions (
  id                bigserial primary key,
  site_id           text        not null,
  site_label        text        not null default '',
  local_id          text        not null,
  titre             text        not null default '',
  statut            text        not null default 'ouverte', -- ouverte | cloturee
  note              text,
  cree_at           timestamptz not null default now(),
  cloture_at        timestamptz,
  unique (site_id, local_id)
);

-- ---------------------------------------------------------------------------
-- 4. Lignes attendues d'une réception (regroupement OF → modèle → couleur → taille)
-- ---------------------------------------------------------------------------
create table if not exists public.reception_lines (
  id                  bigserial primary key,
  site_id             text        not null,
  local_id            text        not null,
  reception_local_id  text        not null, -- local_id de la réception parente
  of                  text        not null default '',
  modele              text        not null default '',
  couleur             text        not null default '',
  couleur_code        text        not null default '',
  taille              text        not null default '',
  manche              text        not null default '',
  attendu             integer     not null default 0,
  unique (site_id, local_id)
);

create index if not exists idx_reception_lines_reception on public.reception_lines (site_id, reception_local_id);

-- ---------------------------------------------------------------------------
-- 5. Pointages de scans (cumul multi-sessions, quantité par code)
-- ---------------------------------------------------------------------------
create table if not exists public.scan_records (
  id                 bigserial primary key,
  site_id            text        not null,
  local_id           text        not null,
  reception_local_id text        not null, -- local_id de la réception parente
  code_barre         text        not null,
  quantite           integer     not null default 0,
  pointe_at          timestamptz not null default now(), -- premier pointage
  maj_at             timestamptz not null default now(), -- dernier incrément
  unique (site_id, local_id)
);

create index if not exists idx_scan_records_reception on public.scan_records (site_id, reception_local_id);
create index if not exists idx_scan_records_code      on public.scan_records (code_barre);

-- ---------------------------------------------------------------------------
-- Droits d'accès : l'application écrit avec la clé API du serveur
-- (sb_publishable_… ou service_role). Ces GRANT garantissent que la clé
-- fonctionne quelles que soient les options par défaut du projet Supabase.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

-- ============================================================================
-- (Optionnel — équipe informatique) Sécurisation par RLS :
-- si un jour des accès directs navigateur sont nécessaires, activez RLS et
-- créez des policies par site. En l'état, seul le serveur de l'application
-- (clé API du projet) parle à ces tables : aucune exposition publique.
-- ============================================================================
