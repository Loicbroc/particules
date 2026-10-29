# Particules

Projet d’application Three.js : importer une photo et la reconstruire avec des particules tournoyantes.

Le dépôt contient pour le moment le socle de déploiement et une page d’attente. L’import de photos et le moteur de particules restent à développer.

## Branches

- `dev` : développement et prévisualisations.
- `production` : version destinée au déploiement public.
- `main` : point d’initialisation du dépôt.

## Développement local

Node.js 22 ou supérieur.

```bash
npm ci
npm run dev
```

`npm run build` copie les fichiers de `public/` dans `dist/`. Ce socle pourra être remplacé par Vite lors de l’ajout de Three.js.

## Cloudflare Workers

La configuration se trouve dans `wrangler.jsonc`. Les fichiers du site sont servis directement par Workers Static Assets ; aucun Worker applicatif n’est nécessaire à ce stade.

Pour connecter le dépôt dans Workers Builds :

| Réglage | Valeur |
| --- | --- |
| Dépôt | `Loicbroc/particules` |
| Branche de production | `production` |
| Répertoire racine | `/` |
| Commande de build | `npm run build` |
| Commande de déploiement | `npx wrangler deploy` |
| Prévisualisations des autres branches | Activer pour `dev` |
| Commande de prévisualisation | `npx wrangler preview` |
| Nom du Worker | `particules` |

La sélection de la branche de production et l’activation des builds de prévisualisation se font dans Cloudflare ; elles ne sont pas pilotées par `wrangler.jsonc`.

Commandes complémentaires :

```bash
npm run check:deploy   # Build et validation locale, sans publication
npm run deploy        # Publication du Worker (utiliser la branche production)
npm run deploy:preview # Création d’une prévisualisation
```

Les photos seront traitées localement dans le navigateur lors de l’implémentation de l’expérience. Aucun stockage distant ni identifiant secret n’est configuré.
