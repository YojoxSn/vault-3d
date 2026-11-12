<div align="center">

# VAULT·3D

**Votre second cerveau Obsidian en hologramme 3D, contrôlé à mains nues.**

[![Démo en ligne](https://img.shields.io/badge/▶_démo_en_ligne-essayer-00e5ff?style=for-the-badge)](https://YojoxSn.github.io/vault-3d/)

<img src="images/hero.png" alt="Un vault de notes en hologramme : la hauteur est le temps, les secteurs sont les dossiers" width="860">

[English](README.md)

</div>

---

## C'est quoi ?

Vault 3D transforme les notes d'un vault [Obsidian](https://obsidian.md) en **hologramme 3D interactif**: chaque note est une sphère lumineuse, chaque lien un rayon de lumière, et vous tournez, zoomez et ouvrez les notes **avec vos mains, via la webcam**, comme Tony Stark dans Iron Man.

Tout tourne **dans votre navigateur**: vos notes et votre caméra ne quittent jamais votre ordinateur. Ce projet a été construit avec **[Claude Code](https://claude.com/claude-code) à partir d'un prompt**, et le prompt est ci-dessous pour que vous puissiez faire pareil.

## L'essayer

1. Ouvrez la **[démo en ligne](https://YojoxSn.github.io/vault-3d/)** (un vault fictif de 198 notes, rien à installer).
2. Appuyez sur **H**, autorisez la caméra, levez la main (bonne lumière, 40 à 80 cm de la caméra).
3. Ou **déposez le dossier de votre vault** sur la page: il est lu dans l'onglet de votre navigateur et n'est jamais envoyé.

Si ça vous plaît, **⭐ mettez une étoile au dépôt**: c'est la principale façon dont les autres le découvrent. Un extrait avec votre propre vault ? Partagez-le avec `#Vault3D`.

## Le prompt

Collez-le dans Claude Code, lancé dans un **dossier vide** (pas dans votre vault). Voici la version courte; le prompt original complet est dans **[PROMPT.md](PROMPT.md)**.

<details>
<summary><b>Voir le prompt</b></summary>

```text
Crée-moi une visualisation 3D interactive de TOUT mon vault Obsidian avec Three.js,
contrôlable avec mes mains via la webcam, façon hologramme de Tony Stark dans Iron Man.

Contexte
- Mon vault se trouve ici : <CHEMIN/VERS/MON/VAULT>   (nom : <NOM>)
- App web locale : Vite + TypeScript + Three.js (sans framework lourd), lancée avec `npm run dev`.

Étape 1 - Importer le vault : un script Node parcourt le vault (ignorer .obsidian/, .trash/),
détecte [[wikilinks]], [[Note|alias]], [texte](Note.md), #tags et tags du frontmatter YAML,
résout les liens comme Obsidian ; un lien vers une note inexistante devient un nœud « fantôme ».
Le vault reste en LECTURE SEULE. Mode live avec chokidar.

Étape 2 - Scène 3D : une sphère lumineuse par note (taille = connexions, couleur = dossier racine),
liens lumineux avec des particules qui circulent, disposition d3-force-3d, bloom, brouillard,
étoiles, scanlines. InstancedMesh : fluide avec 3000+ notes.

Étape 3 - Contrôle par les mains (MediaPipe Tasks Vision) : fenêtre caméra flottante avec squelette néon.
Main ouverte = tourner, pincement = attraper / cliquer, deux mains pincées = zoom, index pointé = curseur 3D,
poing = figer la rotation, balayage = note liée précédente / suivante, deux paumes = recentrer.
Lisse les mains (filtre One Euro). Tout doit aussi marcher à la souris et au clavier.
La vidéo ne quitte jamais le navigateur.

Étape 4 - Panneau latéral avec la note complète, recherche ( / ), filtres, bouton « Ouvrir dans Obsidian ».
Étape 5 - HUD, légende des couleurs, code modulaire, tests de reconnaissance des gestes avec des points simulés.
À la fin, donne-moi les commandes exactes pour installer et lancer.
```

</details>

**À quoi s'attendre.** Le prompt donne une première version qui marche. C'est une IA qui écrit le code: deux essais ne donneront pas exactement les mêmes fichiers. Les gestes demandent parfois un réglage selon votre webcam: dites à Claude Code ce qui ne va pas. Ce dépôt, c'est ce résultat plus du soin (mode Orbe, vault de démo, tests, déploiement en un clic).

## Le résultat

<img src="images/demo.gif" alt="Démo animée : l'orbe tourne, zoome, une note s'éclaire avec ses voisines et son panneau s'ouvre" width="860">

*Capturé depuis la démo en ligne, à la souris et au clavier. Un extrait avec les mains arrive.*

<img src="images/note-panel.png" alt="Une note avec ses liens, voisines éclairées" width="860">

<img src="images/real-vault-hands.png" alt="Première version sur un vrai vault de 2 054 notes, mode mains actif" width="860">

## Commandes

| Geste | Effet |
|---|---|
| ✋ Main ouverte qui bouge | Tourner |
| 🤏 Pincement bref sur une sphère | Voler vers la note et l'ouvrir |
| 🤏 Pincement maintenu qui bouge | Attraper et faire tourner |
| 🤏🤏 Deux mains pincées qui s'écartent / se rapprochent | Zoom |
| ☝️ Index pointé | Curseur 3D, éclaire la note et ses voisines |
| ✊ Poing tenu 0,6 s | Fige / relance la rotation |
| 👋 Balayage rapide gauche / droite | Note liée précédente / suivante |
| 🙌 Deux paumes vers la caméra | Recentrer |

Touches: `/` recherche · `O` orbe / réseau libre · `B` cerveau · `G` hologramme · `H` mains · `Q` qualité · `R` recentrer · `Espace` pause · `Échap` fermer.

**Mode Orbe** (par défaut): les notes sont sur un globe de verre. Hauteur = temps (les plus récentes au pôle nord), secteur = dossier, les notes très reliées s'enfoncent vers le cœur lumineux.

## Lancer chez vous

```bash
git clone https://github.com/YojoxSn/vault-3d.git
cd vault-3d/app
npm install
npm run dev          # http://localhost:5173
```

Pour charger votre vault automatiquement, copiez `.env.example` en `.env` et renseignez `VAULT_PATH`. Votre vault est en lecture seule, et `.env` ainsi que les fichiers générés sont ignorés par git.

## Limites assumées

- **La fluidité dépend de votre carte graphique.** La qualité s'adapte toute seule (Auto) et se force avec `Q` ou le menu Quality: High, Medium, Low. Si ça saccade encore, vérifiez que l'accélération matérielle est activée dans votre navigateur (`chrome://gpu` doit indiquer « WebGL: Hardware accelerated »).
- Les gestes sont testés sur des **mains simulées** et dans un vrai navigateur, mais **webcams et éclairages varient**: les seuils peuvent demander un réglage.
- La fluidité sur un vrai GPU avec plus de 2 000 notes n'est pas encore mesurée.

Licence [MIT](LICENSE). Non affilié à Obsidian ni à Marvel.
