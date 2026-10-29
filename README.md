# Particules

Application Three.js qui recompose une photo avec un nuage de particules en spirale. La photo est décodée et traitée dans le navigateur, sans envoi ni stockage sur un serveur.

## Fonctionnalités

- Démonstration animée dès l’ouverture.
- Import local par le sélecteur de fichiers ou par glisser-déposer : JPEG, PNG, WebP et autres formats décodables par le navigateur. Maximum 50 Mo par fichier.
- Couleurs et proportions conservées ; transparence des PNG prise en compte.
- Animation sur le GPU : trois courants en spirale convergent pour former la photo.
- Répulsion au survol ou au toucher, puis retour des particules à leur position.
- Rejouer, pause/reprise, disperser et recomposer.
- Durée de formation et intensité du tourbillon réglables.
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

Vite regroupe le code et Three.js dans des fichiers distincts. L’image d’exemple et toutes les dépendances sont servies depuis le même site : aucun CDN n’est requis à l’exécution.

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
