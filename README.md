# Particules

Application Three.js qui recompose une photo à partir d’un ciel de particules lumineuses. La photo est décodée et traitée dans le navigateur, sans envoi ni stockage sur un serveur.

## Fonctionnalités

- Démonstration animée dès l’ouverture.
- Import local par le sélecteur de fichiers ou par glisser-déposer : JPEG, PNG, WebP et autres formats décodables par le navigateur. Maximum 50 Mo par fichier.
- Couleurs et proportions conservées ; transparence des PNG prise en compte.
- Animation sur le GPU : un champ d’étoiles réparties sur tout l’écran, en profondeur, se rassemble progressivement pour former la photo. Scintillement discret, halos et parallaxe ; nombre d’étoiles visibles adapté à la densité pour conserver un ciel aéré.
- Envol fluide au survol ou au toucher : la direction et la vitesse du geste entraînent les particules comme un courant d’air. Leur élan s’amortit, de petits remous les font flotter et elles reviennent progressivement à la photo, même après le passage du pointeur.
- Volume 3D activé par défaut : les points occupent des profondeurs différentes, avec une compensation de perspective pour conserver la photo de face. Cliquez-glissez pour tourner autour, puis survolez pour faire voler les grains depuis n’importe quel angle. Sur mobile : rotation à un doigt par défaut, bouton Disperser pour l’envol à un doigt, pincement à deux doigts pour zoomer. Le bouton Vue de face rétablit progressivement la caméra et le zoom d’origine.
- Relief 2,5D : un relief artistique est créé immédiatement sur l’appareil, puis affiné avec Depth Anything V2 Small si le modèle est disponible. Un échec du téléchargement ou de l’inférence conserve le relief artistique et permet de réessayer l’IA. Le mode artistique utilise une interprétation des couleurs et de la composition, sans prétendre représenter une profondeur réelle.
- Vague en profondeur, activable et réglable.
- Galerie locale de 8 photos maximum : import multiple et glisser-déposer, vignettes, précédent/suivant et suppression. La galerie dure le temps de l’onglet.
- Transformation entre les photos : les particules quittent leur position, traversent l’espace et changent de couleur pour recomposer la suivante, avec conservation des proportions et de la transparence. La transition peut être mise en pause.
- Souffle de vent : un front traverse l’image, emporte les grains en traînées puis les laisse se reformer. Son intensité se règle avec celle des autres effets.
- Explosion en tempête de poussière depuis le bouton ou par un clic/toucher bref sur l’image : trois courants en volume, dont un à contre-sens, rafales avec accélérations et décélérations, soulèvements et petits remous. L’animation dure 14 secondes puis reforme doucement la photo. Chaque déclenchement varie les courants ; pause et intensité restent disponibles.
- Rejouer, pause/reprise, Constellation et recomposer.
- Durée de formation et dérive des étoiles réglables. Constellation ramène la photo à un nuage d’étoiles ancré dans l’espace, explorable en rotation et en zoom.
- Densité Fluide / Auto / Détail, avec **Détail par défaut** (jusqu’à 240 000 particules sur ordinateur et 110 000 sur mobile). Auto réduit la densité lorsque le rythme d’affichage devient trop faible.
- Zoom libre par déplacement réel de la caméra avec la molette ou le pincement, sans butées de grossissement imposées. Déplacement latéral par clic droit glissé sur PC ou glissement à deux doigts sur mobile. Vue de face restaure position, orientation et zoom ; plein écran lorsque le navigateur le permet.
- Sur PC, les effets et commandes de lecture sont réunis sur une seule ligne.
- Bouton œil pour masquer tous les menus, le statut et le pied de page, et profiter d’un cadrage centré utilisant l’espace libéré. Un œil discret permet de les réafficher sur téléphone comme sur PC ; H bascule l’interface et Échap la restaure. Rotation, zoom et clic d’explosion restent utilisables. Le plein écran du navigateur reste disponible séparément avec F.
- Interface mobile compacte : statut sous le titre, effets sur une bande horizontale, lecture/pause/dispersion en pictogrammes, choix Tourner/Disperser et ajout de photos sur la même rangée. Le cadrage de la photo utilise l’espace réel entre l’en-tête et les commandes ; les réglages restent dans un panneau repliable.
- Respect de la préférence de réduction des mouvements, suspension quand l’onglet est masqué, signalement des pertes de contexte WebGL.
- PWA installable sur ordinateur et téléphone : icônes dédiées, ouverture sans barre de navigateur et bouton d’installation lorsque le navigateur le propose. Sur iPhone/iPad : Partager → Sur l’écran d’accueil.
- Après un premier chargement complet, l’application, la démonstration, les imports locaux et les effets artistiques restent utilisables hors connexion. Le téléchargement initial du modèle IA nécessite Internet. Les photos importées restent limitées à la session et ne sont pas conservées par le service worker.
- Mises à jour préparées en arrière-plan et proposées dans les réglages. Le rechargement reste volontaire pour ne pas fermer une galerie en cours. Une installation incomplète conserve la version précédente.

## Performances

- Préparation des points directement dans des tableaux typés ; les attributs d’origine sont partagés hors transition entre photos, soit 6,72 Mo de buffers GPU dupliqués évités pour 240 000 points.
- Index de survol réutilisé. La vague est évaluée uniquement sur les candidats proches du pointeur, sans reconstruire tout le nuage à chaque changement de phase ; les tests comparent le résultat à un calcul exhaustif depuis plusieurs angles.
- Seuls les blocs de points nouvellement envolés sont transférés au GPU.
- Détail reste la densité par défaut. La résolution de rendu peut baisser progressivement sous charge puis remonter, sans réduire le nombre de points en Détail.
- Rendu limité à 60 images/s, et à 30 lorsque la photo est au repos ; arrêt dans un onglet masqué. Les rotations, les effets et les derniers grains en vol gardent la cadence active.
- Les photos de plus de 1 600 pixels sur leur grand côté sont remplacées par une copie de travail locale réduite, pour limiter la mémoire de la galerie. Le fichier original reste intact ; ses dimensions restent affichées.
- Photo de démonstration convertie en WebP et préchargée ; écritures DOM limitées aux changements visibles.

`node scripts/benchmark-picker.mjs` mesure séparément la reconstruction et les requêtes de l’index sur 240 000 points. Ce microbenchmark CPU ne mesure pas les FPS d’un appareil réel.

La photo se lit de face. Le mode Volume 3D répartit les points dans un volume anamorphique ; Relief IA interprète la profondeur du sujet. L’application ne reconstruit pas un modèle 3D complet du sujet.

## Branches

- `dev` : développement et prévisualisation.
- `production` : version validée à publier.
- `main` : point d’initialisation historique.

Les nouveautés sont livrées sur `dev` avant promotion vers `production`.

## Développement

Node.js 22.12 ou supérieur (ou 24+), npm et un navigateur compatible WebGL 2.

```bash
npm ci
npm run dev
```

Vite regroupe le code et Three.js dans des fichiers distincts. L’expérience de base est servie depuis le même site. Le relief est optionnel : un Web Worker télécharge Transformers.js 3.8.1 depuis jsDelivr, puis le modèle quantifié depuis Hugging Face. Aucun pixel de la photo n’est envoyé à ces services. Le calcul utilise WebAssembly sur l’appareil et les fichiers du modèle peuvent être conservés dans le cache du navigateur.

```bash
npm run build        # Produit dist/
npm run preview      # Vérifie le build avec le runtime local Cloudflare
npm run check:deploy # Build et simulation de déploiement sans publication
npm test             # Interactions 3D, transitions, précision du survol et cache PWA
```

Raccourcis : Espace = pause/reprise ; R = rejouer ; F = plein écran. Ils sont désactivés pendant la manipulation des champs et boutons.

Le build produit également `dist/sw.js`, avec une version dérivée du contenu des ressources et du service worker. Aucun gros modèle externe n’est inclus dans le cache d’installation. Le service worker est enregistré uniquement sur le build de production, pas sur le serveur Vite de développement. Le cache conserve une génération précédente pour les onglets déjà ouverts.

## Cloudflare Workers

`wrangler.jsonc` contient la configuration de Workers Static Assets ainsi que `"previews": {}`. Aucun Worker applicatif ni service de stockage n’est nécessaire.

| Réglage Workers Builds | Valeur |
| --- | --- |
| Dépôt | `Loicbroc/particules` |
| Branche de production | `production` |
| Répertoire racine | `/` |
| Build | `npm run build` |
| Déploiement | `npx wrangler deploy` |
| Prévisualisation | `npx wrangler preview` |
| Branche à prévisualiser | `dev` |
| Nom du Worker | `particules` |

La sélection de la branche publiée et l’activation des prévisualisations se règlent dans Cloudflare, indépendamment de `wrangler.jsonc`.

Commandes manuelles : `npm run deploy` pour publier depuis `production` ; `npm run deploy:preview` pour créer une prévisualisation.

## Photo d’exemple

Photographie du lac de Braies par Luca Bravo, utilisée sous la licence Unsplash. Voir [les crédits](public/ATTRIBUTION.md), également disponibles dans le panneau d’information de l’application.
