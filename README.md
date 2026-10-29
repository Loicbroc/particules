# Particules

Application Three.js qui recompose une photo à partir d’un ciel de particules lumineuses. La photo est décodée et traitée dans le navigateur, sans envoi ni stockage sur un serveur.

## Fonctionnalités

- Démonstration animée dès l’ouverture.
- Import local par le sélecteur de fichiers ou par glisser-déposer : JPEG, PNG, WebP et autres formats décodables par le navigateur. Maximum 50 Mo par fichier.
- Couleurs et proportions conservées ; transparence des PNG prise en compte.
- Animation sur le GPU : un champ d’étoiles réparties sur tout l’écran, en profondeur, se rassemble progressivement pour former la photo. Scintillement discret, halos et parallaxe ; nombre d’étoiles visibles adapté à la densité pour conserver un ciel aéré.
- Envol progressif au survol ou au toucher : chaque particule garde son élan et revient doucement former la photo, même après le passage du pointeur.
- Relief 2,5D : un relief artistique est créé immédiatement sur l’appareil, puis affiné avec Depth Anything V2 Small si le modèle est disponible. Un échec du téléchargement ou de l’inférence conserve le relief artistique et permet de réessayer l’IA. Le mode artistique utilise une interprétation des couleurs et de la composition, sans prétendre représenter une profondeur réelle.
- Vague en profondeur, activable et réglable.
- Galerie locale de 8 photos maximum : import multiple et glisser-déposer, vignettes, précédent/suivant et suppression. La galerie dure le temps de l’onglet.
- Transformation entre les photos : les particules quittent leur position, traversent l’espace et changent de couleur pour recomposer la suivante, avec conservation des proportions et de la transparence. La transition peut être mise en pause.
- Souffle de vent : un front traverse l’image, emporte les grains en traînées puis les laisse se reformer. Son intensité se règle avec celle des autres effets.
- Explosion en volume depuis le bouton ou par un clic/toucher bref sur l’image, suivie d’un retour progressif à la photo.
- Rejouer, pause/reprise, disperser et recomposer.
- Durée de formation et dérive des étoiles réglables. Disperser ramène la photo au ciel étoilé.
- Densité Fluide / Auto / Détail. Auto réduit la densité lorsque le rythme d’affichage devient trop faible.
- Zoom par molette ou pincement à deux doigts ; plein écran lorsque le navigateur le permet.
- Interface adaptée aux petits écrans, réglages dans un panneau repliable.
- Respect de la préférence de réduction des mouvements, suspension quand l’onglet est masqué, signalement des pertes de contexte WebGL.

La photo se lit de face. Les particules évoluent en 3D pendant les mouvements ; l’application ne reconstruit pas un modèle 3D du sujet.

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
```

Raccourcis : Espace = pause/reprise ; R = rejouer ; F = plein écran. Ils sont désactivés pendant la manipulation des champs et boutons.

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
