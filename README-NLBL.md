# Génération du fichier .NLBL — Données intégrées pour Zebra Designer Essentials 3

## 🎯 Objectif atteint

Le bouton **« Générer le fichier .NLBL »** de la page Étiquettes & colisage produit
directement un fichier `.nlbl` **avec les données déjà intégrées** : il suffit de
l'ouvrir dans Zebra Designer Essentials 3 et d'imprimer. **L'import manuel du fichier
texte (« Charger… ») est supprimé.**

## 📖 Rappel : format .nlbl

Un `.nlbl` Zebra Designer 3 est une **archive ZIP chiffrée en AES-256** (WinZip AES,
variante AE-1) contenant deux XML UTF-8 :

| Entrée               | Rôle                                                    |
| -------------------- | ------------------------------------------------------- |
| `Formats/<nom>`      | Design de l'étiquette (objets, polices, positions, code-barres) |
| `<nom>.slnx`         | Solution : définition des **variables** et de leurs valeurs |

Le chiffrement utilise un **mot de passe fixe du format** : les fichiers générés sont
indistinguables d'un enregistrement natif Zebra Designer.

Le service (`src/lib/nlbl/`) recharge le template `cLEMENT2`, remplace uniquement les
**valeurs des 7 variables** (`DefaultValue`/`SampleValue` du `.slnx`) et re-packe le tout.
Le design (polices, positions, tailles, paramètres du code-barres EAN-13) est
**strictement inchangé** — vérifié octet pour octet par les tests.

## 🖱️ Utilisation

### Espace « Colisage » (codes scannés → colisage groupé)

Onglet **Colisage** en haut de page : collez 3 000 à 4 000 codes-barres scannés à la
douchette (un par ligne, ou importez/glissez un fichier `.txt`/`.csv` — les codes à 13
chiffres sont extraits automatiquement, même depuis un export multi-colonnes), puis
**« Générer le colisage »**. Le système retrouve chaque code dans la base (référence
FAB, ou code **SPE décodé** grâce aux OF du journal + OF facultatifs saisis) et
regroupe automatiquement **OF → modèle → couleur → taille** avec les quantités
(un code rescanné = une pièce de plus). Résultat : statistiques, tableau groupé avec
sous-totaux pièces par OF, codes inconnus signalés (sans bloquer), **copie TSV**
(presse-papiers, collable dans Excel/ERP) et export **`colisage_AAAAMMJJ_HHmm.csv`**.
Performance mesurée : **4 000 codes traités en ~45 ms** côté serveur.

### Étiquette courante (cas principal)

1. Sélectionner article → couleur (grille) → manche → taille (grille triée du plus
   petit au plus grand), saisir l'**OF** et le **type** ;
2. Cliquer sur **« Générer le fichier .NLBL »** (bouton orange, à côté de l'export .TXT
   conservé) ;
3. Ouvrir le fichier téléchargé `etiquettes_AAAAMMJJ_HHmm.nlbl` dans Zebra Designer 3 ;
4. Cliquer **Imprimer** : les valeurs sont déjà remplies dans « Variables de saisie
   clavier », régler la quantité (50, 100…) et lancer l'impression.

> 💡 **N copies de la même étiquette** : un seul fichier .nlbl suffit — la quantité se
> règle dans la fenêtre d'impression de Zebra Designer (comme aujourd'hui).

### Lot de plusieurs étiquettes distinctes

1. Configurer une étiquette puis **« Ajouter l'étiquette courante »** à la
   **File d'impression** ;
2. Recommencer pour chaque étiquette (max **100** par lot) ;
3. **« Générer le lot »** produit une **archive .zip** contenant un `.nlbl` par
   étiquette (nommés `etiquette_001_MODELE_OFxxxxx.nlbl`…) + un `LISEZMOI.txt`.

> ⚠️ **Pourquoi un .zip de fichiers ?** Zebra Designer **Essentials** (gratuit) ne
> gère pas les sources de données (fichier texte/Excel/SQL : réservé à la version
> **Pro**). Une étiquette = un jeu de valeurs variables ; N étiquettes distinctes =
> N fichiers, livrés ensemble dans une archive. Les fichiers s'ouvrent tous
> directement, sans aucune importation.

## 🧰 Fonctions d'accompagnement

| Fonction | Détail |
| -------- | ------ |
| **Logo Clément Design** | Logo officiel « CLEMENT DESIGN® » (mot-symbole fourni par l'entreprise) affiché **en haut de l'aperçu étiquette** (proportions préservées, hauteur réduite pour laisser la place aux infos essentielles : modèle, taille, couleur, référence/OF, code-barres), dans l'aperçu agrandi et l'en-tête de l'application. Fichiers : `public/logo-clement.png` (variante noire, fond transparent — fond clair) et `public/logo-clement-blanc.png` (variante blanche, fond transparent — fond sombre). **Impression** : le design .NLBL étant conservé à l'identique (voir décision ci-dessous), ajoutez le logo une seule fois dans Zebra Designer (« Insérer > Image », glissez `logo-clement.png`, placez-le en haut, enregistrez le modèle) — le fichier image est fourni prêt à l'emploi |
| **Étiquette : taille FR seul** | La ligne Taille affiche **uniquement la taille en français** : « T46 », « XS », « TU » — plus de « T46-S46 » (s'applique à l'aperçu, au .NLBL et à l'export .TXT) |
| **Étiquette : couleur EN / FR** | Affichage bilingue **« White / Blanc »**, repli automatique sur **français seul** si la ligne dépasse 20 caractères (ex. « Gris souris », « Anthracite ») — priorité lisibilité de l'étiquette ; couleurs identiques EN/FR (Fuchsia, Beige…) affichées une seule fois |
| **Grille de couleurs du stock** | Sélection par **puces cliquables** (plus de liste déroulante) : couleurs de l'article en mode FAB, **toutes les couleurs du stock** en mode SPE (badge « tout le stock · N ») — alimentée **exclusivement par la base de données** : une couleur ajoutée au stock apparaît automatiquement ; tri alphabétique par libellé français |
| **Grille de tailles triée** | Sélection par **grille de puces** triée **logiquement du plus petit au plus grand** (U/TU → bébé → tranches d'âge → XS→S→M→L→XL→XXL→3XL→4XL→5XL → numériques 34…64 et T0…T64 dans l'ordre numérique → SPE- → SPE+) — pas de tri alphabétique absurde (un module dédié `src/lib/tailles.ts` établit l'ordre total, testé) |
| **Colisage par scan (onglet dédié)** | Voir « Espace Colisage » ci-dessus : collage/import de 3 000-4 000 codes, décodage SPE, regroupement OF→modèle→couleur→taille, quantités, CSV/TSV |
| **Préférences d'imprimante** | Icône engrenage (en-tête) : personnalise l'imprimante cible intégrée aux .NLBL (nom exact Windows + rappel dpi). Mémorisé localement ; sinon « ZDesigner GK420d » (valeur du modèle). Réglages uniquement — le design n'est jamais modifié |
| **Contenu du fichier .NLBL** | Bouton **Contenu** (section « Variables intégrées au fichier ») : structure exacte du fichier qui serait généré — entrées de l'archive, chiffrement AES-256, taille, imprimante cible, les 7 variables et le XML complet de la solution (sans téléchargement ni journalisation) |
| **Mode d'emploi intégré** | Icône « ? » (en-tête) : guide en 8 étapes (.NLBL, lot, imprimante, scan douchette, ancien flux .TXT, régénération, colisage, filtre par période) + tableau des raccourcis clavier + « Bon à savoir » |
| **Scan douchette** | Champ dédié dans la file d'impression : scannez (ou saisissez) un code EAN-13 + Entrée → l'étiquette correspondante est ajoutée à la file avec l'OF et le type du formulaire ; enchaînement continu des scans (champ toujours vidé), erreurs explicites (code inconnu, SPE non scannable, OF/type manquants), indicateur vert de confirmation |
| **Import d'un .TXT historique** | Bouton **« Importer un .TXT »** (file d'impression) **ou glisser-déposer du fichier directement sur la carte** (voile « Déposez le fichier .TXT ici », anneau ambre) : relit un ancien export `Clé=valeur` (un bloc par étiquette, fichiers concaténés acceptés, clés insensibles à la casse) et remet les étiquettes dans la file — les valeurs sont reprises telles quelles, sans repasser par le catalogue ; blocs invalides (code-barres EAN-13 invalide) ignorés et comptés. Max 100 par import, 1 Mo ; un .json déposé oriente vers « Restaurer une sauvegarde » |
| **Aperçu du lot (miniatures)** | Bandeau horizontal sous les lots mémorisés : jusqu'à 12 miniatures d'étiquettes (modèle, taille, couleur, OF, code-barres) reprises de la file, badge ×N si quantité > 1, tuile « +N autres » au-delà ; clic sur une miniature → défilement + mise en évidence de la ligne correspondante dans la file |
| **Application installable (PWA)** | Manifest + icônes ambre (192/512 + maskable + apple-touch) : « Installer l'application » depuis le navigateur pour un raccourci plein écran sur la tablette de l'atelier (sans store) ; couleur de thème adaptée clair/sombre |
| **Régénération depuis le journal** | Icône ↺ au survol d'une entrée .NLBL : remet toutes les étiquettes de cette génération dans la file d'impression (7 variables journalisées) — disponible sur les générations récentes, tooltip explicatif sur les anciennes entrées |
| **Sauvegarde / restauration du journal** | Icônes dossier ↓/↑ (carte « Dernières générations ») : télécharge **toutes** les entrées en JSON horodaté (`journal_etiquettes_AAAAMMJJ_HHmm.json`, max 2 000) puis restaure un fichier de sauvegarde à tout moment — les doublons (identifiant ou fichier + date identiques) sont ignorés automatiquement, restauration rejouable sans risque |
| **Lots mémorisés (présets de file)** | Bouton **« Mémoriser le lot »** (file d'impression) : enregistre la file courante (nom libre, max 10 lots, quantités conservées) dans `localStorage` ; chips ambre « Lots mémorisés » pour recharger en un clic (confirmation avant remplacement d'une file non vide, suppression par la croix) — indépendant du catalogue |
| **Recherche avancée du catalogue** | Lien **« Recherche avancée »** au-dessus du champ Article : filtre les 4 623 références par article/code-barres (plein texte) + couleur + manche + taille, compteur de résultats (50 affichés max), clic = remplissage automatique de tout le formulaire — filtrage local instantané, sans appel API |
| **Vidage complet du journal** | Icône gomme (carte « Dernières générations ») + confirmation : supprime **toutes** les entrées (historique + statistiques remis à zéro) — les fichiers déjà téléchargés ne sont pas affectés |
| **Mode sombre** | Icône ☀/☾ (en-tête) : bascule thème clair / sombre, mémorisé d'une session à l'autre. Graphique, tooltips et barres de défilement adaptés ; l'aperçu de l'étiquette reste toujours blanc (simulation de l'impression) |
| **Articles favoris** | Étoile sur chaque ligne du sélecteur d'article (max 8) : groupe « ★ Favoris » en tête de liste + chips dédiées sous le champ. Mémorisé localement |
| **Suppression d'une entrée du journal** | Corbeille au survol de chaque ligne (confirmation) : retire l'entrée de l'historique et des statistiques — les fichiers déjà téléchargés ne sont pas affectés |
| **Top modèles** | Classement des 5 modèles les plus générés sur la période choisie (barres de progression, étiquettes · fichiers), dans la carte « Activité » |
| **Quantités par ligne (file d'impression)** | Stepper −/＋ sur chaque ligne de la file (1-99 copies) : le nombre de fichiers reste inchangé (un .nlbl par étiquette distincte) et les consignes de copies sont reprises dans le **LISEZMOI.txt** du .zip ; libellé du bouton et journal affichent le total de copies |
| **Journal paginé + multi-critères** | 20 entrées par page avec bouton **« Charger plus (20 suivantes) »** (compteur « X entrées affichées sur Y ») ; chips `Tous / .nlbl / .txt` + recherche instantanée sur nom de fichier, type, **modèle** ou **n° d'OF** (y compris les lots multi-OF) ; ligne secondaire « Modèle · OF xxx » sur chaque entrée ; accent ambre à gauche au survol |
| **Statistiques à période ajustable** | Totaux cumulés + étiquettes/jour + graphique quotidien sur **7, 14 ou 30 jours** (sélecteur dans la carte, fuseau Europe/Paris) ; synthèse sous le graphique : **meilleur jour** de la période (étiquettes générées) et **jours actifs** (jours ayant au moins un fichier) |
| **Filtre du journal par période** | Chips `Aujourd'hui / 7 jours / 30 jours / Tout` + « Dates… » (plage personnalisée avec deux champs date) : filtre appliqué **côté serveur** — pagination « Charger plus », compteur total et export CSV respectent la période (fuseau Europe/Paris, gestion du changement d'heure incluse) ; état vide dédié avec lien « Élargir la période » et avertissement si la plage est inversée |
| **Aperçu agrandi** | Bouton ⤢ sur la carte « Aperçu » : étiquette en grand pour vérification avant impression |
| **Derniers n° d'OF** | Chips sous le champ OF (max 3, mémorisés localement) — reprise en un clic |
| **Type mémorisé** | Le dernier « Type de produit » choisi est restauré à la prochaine session |
| **Export CSV du journal** | Bouton **CSV** : 1 000 dernières entrées (`Date;Type;Fichier;Étiquettes;Modèle;OF`), séparateur `;`, BOM UTF-8 (accents corrects dans Excel) ; **respecte la période sélectionnée** dans le journal le cas échéant |
| **Fusion des doublons dans la file** | Ajouter/scanner une étiquette **strictement identique** (les 7 variables) à une ligne existante augmente sa quantité au lieu de dupliquer la ligne (toast « quantité portée à N », plafond 99) — idéal au scan continu ; deux étiquettes de même modèle mais de couleurs/tailles différentes restent des lignes distinctes |
| **Copier les variables** | Copie les 7 variables au format `Clé=valeur` (identique à l'export TXT) |
| **Raccourci clavier** | `Ctrl/⌘ + ⏎` génère le fichier .NLBL courant · `Ctrl/⌘ + K` ouvre la recherche avancée · `Ctrl/⌘ + M` ajoute l'étiquette courante à la file (indice ⌨ visible dans l'interface, liste complète dans le mode d'emploi) |

## ✅ Validation automatique avant génération

| Contrôle                 | Règle                                                      |
| ------------------------ | ---------------------------------------------------------- |
| Champs obligatoires      | Modele, Type, OF, CodeBarre, Couleur, Taille (Manche facultative) |
| Code-barres              | 13 chiffres + **clé de contrôle EAN-13** obligatoire       |
| Longueurs maximales      | Modèle 40 · Type 60 · OF 20 · Couleur 40 · Manche 60 · Taille 20 |
| Caractères interdits     | Caractères de contrôle supprimés, espaces normalisés       |
| Échappement XML          | `& < > " '` échappés, encodage **UTF-8 + BOM** (accents OK) |
| Volume                   | Max **100 étiquettes** par lot (erreur explicite au-delà)  |
| Quantités (copies)       | Entier **1-99** par étiquette, aligné sur la liste ; valeurs invalides normalisées à 1 |

En cas d'échec : message d'erreur explicite en français (toast + détail par champ).

## 🔧 Architecture technique

```
src/lib/nlbl/
├── templates/                    # Template cLEMENT2 (référence, non dénaturé)
│   ├── cLEMENT2_label.xml        #   XML étiquette (bloc <Printer> : cible imprimante)
│   ├── cLEMENT2_solution.slnx.xml#   XML solution (variables)
│   └── cLEMENT2_reference.nlbl   #   .nlbl original chiffré (référence)
├── zip-aes.ts                    # ZIP + WinZip AES-256 (AE-1) sans dépendance
├── validation.ts                 # Validation + échappement XML + EAN-13 + imprimante
├── generator.ts                  # Injection variables + imprimante + assemblage .nlbl/.zip + aperçu
src/app/api/nlbl/route.ts         # POST { labels[], printer?, quantites? } → binaire .nlbl / .zip
src/app/api/nlbl/preview/route.ts # POST { labels[], printer? } → structure JSON (aperçu)
src/app/api/generations/route.ts  # Journal paginé (?page=&depuis=&jusqua=, Europe/Paris) + modèle/OF extraits + 7 variables (régénération) + DELETE (purge complète)
src/app/api/generations/[id]/route.ts # DELETE — supprime une entrée du journal (404 si absente)
src/lib/periode-paris.ts          # Conversion jour calendaire → bornes UTC Europe/Paris (filtre de période)
src/app/api/generations/export/route.ts # Export CSV (1 000 dernières entrées, ?depuis=&jusqua= acceptés)
src/lib/txt-import.ts             # Analyse des .TXT « Clé=valeur » pour l'import dans la file
src/app/api/generations/backup/route.ts # GET (sauvegarde JSON complète) + POST (restauration, doublons ignorés)
src/app/api/stats/route.ts        # Statistiques (?jours=7|14|30) + topModeles (classement 5 modèles)
src/lib/label-data.ts             # Calculs métier (couleurs, tailles, SPE, export TXT)
scripts/verifier-nlbl.ts          # Tests (bun run scripts/verifier-nlbl.ts)
scripts/verifier-nlbl.py          # Tests croisés Python/pyzipper (implémentation indépendante)
```

### Injection de l'imprimante cible (préférences utilisateur)

Le template cible `ZDesigner GK420d`. Si une préférence est définie (dialog engrenage,
`localStorage` `clement-imprimante`), le générateur remplace, **sans toucher au design** :

- `<Name>` et `<DriverName>` du bloc `<Printer>` (échappement XML, max 64 caractères) ;
- le champ `dmDeviceName` (WCHAR[32] = 64 octets, UTF-16LE) en tête du `DevModeBuffer`,
  tronqué à 32 caractères et complété par des octets nuls ;
- les occurrences ANSI du nom dans les données driver (`dmDriverExtra`), tronquées à
  16 caractères — même longueur d'octets à chaque fois : **aucun décalage** de la
  structure DEVMODEW.

Vérifié par 51 tests Node + 20 tests Python (extraction AES indépendante), y compris :
nom échappé XML, design identique octet/octet hors bloc imprimante, longueur du
DevModeBuffer inchangée.

Le module AES reproduit **exactement** le comportement de Zebra Designer (vérifié sur
le template original) : sel de 16 octets, PBKDF2-HMAC-SHA1 (1000 itérations), compteur
CTR 128 bits petit-boutien initialisé à 1, HMAC-SHA1 sur les données chiffrées, AE-1
avec CRC32 réel.

## 🧪 Checklist de test manuel dans Zebra Designer Essentials 3

À réaliser une fois sur un poste avec Zebra Designer + ZDesigner GK420d :

- [ ] **Ouverture** : double-cliquer sur `etiquettes_AAAAMMJJ_HHmm.nlbl` → le modèle
      s'ouvre sans erreur ni avertissement ;
- [ ] **Données affichées** : SFAX MC, Noir, T3-S3, Veste / Jacket, Manches courtes /
      Short sleeves, OF: 078594 apparaissent directement dans l'aperçu ;
- [ ] **Variables pré-remplies** : la boîte de dialogue d'impression montre les 7
      variables de « Variable de saisie clavier » déjà valorisées (comme la capture,
      mais sans utiliser « Charger… ») ;
- [ ] **Code-barres** : l'aperçu affiche l'EAN-13 3700791726390 avec sa lecture
      humaine ; scanner la barre à l'impression = même valeur ;
- [ ] **Aperçu avant impression** : Ctrl+P → l'aperçu correspond au rendu écran ;
- [ ] **Quantité** : régler « Nombre d'étiquettes » = 50 → 50 copies identiques ;
- [ ] **Accents** : générer une étiquette « Peau de pêche » → accents corrects dans
      Zebra Designer ;
- [ ] **Lot** : ouvrir les .nlbl d'une archive .zip générée → chaque fichier montre
      ses propres données ;
- [ ] **Imprimante cible** : définir une préférence (ex. ZDesigner ZD621-203dpi ZPL)
      puis générer : à l'ouverture dans Zebra Designer, l'imprimante sélectionnée
      par défaut est celle-là (ou une demande de choix s'affiche si absente du poste) ;
      le design reste identique ;
- [ ] **Contenu du fichier** : bouton « Contenu » → les 7 variables affichées
      correspondent exactement aux données visibles dans Zebra Designer à l'ouverture ;
- [ ] **Non-régression TXT** : « Exporter le fichier .TXT » → « Charger… » dans
      Zebra Designer fonctionne comme avant ;
- [ ] **Impression réelle** : qualité d'impression et position identiques à
      l'ancien flux (design non modifié).

## ❓ Points d'attention / hypothèses à valider

1. **Version de Zebra Designer** : approche validée pour **Zebra Designer Essentials
   3.x** (format .nlbl). Zebra Designer 2 (.lbl) n'est **pas** couvert ;
2. **Un .nlbl = un jeu de valeurs** : la quantité de copies identiques se règle dans
   Zebra Designer ; les étiquettes distinctes nécessitent un fichier chacune
   (contrainte de la version Essentials) ;
3. **Le nom interne** du label dans Zebra Designer correspond au nom de fichier
   (ex. `etiquettes_20250921_1311`) ;
4. Si votre version est **Pro** et que vous souhaitez un vrai flux multi-enregistrements
   (une connexion fichier texte liée au .nlbl), une variante est possible : le
   service générerait alors le .nlbl + le CSV lié dans le même .zip — à demander ;
5. **Imprimante cible personnalisée** : le nom saisi doit être le nom exact de
   l'imprimante Windows (panneau de configuration → Périphériques). Le champ
   dmDeviceName du DEVMODEW est tronqué à 32 caractères (limite Windows) et les
   données driver additionnelles à 16 ; seuls les champs `<Name>`/`<DriverName>`
   (non tronqués) servent à l'appariement dans Zebra Designer. À valider sur poste
   réel avec la checklist ci-dessus.
