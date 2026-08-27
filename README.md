# Test Face

A small static prototype for experimenting with a 2.5D SVG anime face rig and feature sliders.

## Live demo

After GitHub Pages is enabled, the app is published at the repository owner's Pages domain:

<https://dario.technology/2.5D-Face-Gen/>

## Files

- `index.html` contains the page structure.
- `src/styles.css` contains layout and visual styling.
- `src/main.js` boots the app and wires the controls.
- `src/params.js` contains defaults and slider metadata.
- `src/rig.js` solves face landmarks from the current parameters.
- `src/svgRenderer.js` renders solved landmarks as SVG.
- `src/geometry.js` contains projection and interpolation helpers.
- `data/default-face-saves.json` seeds the current face and saved-face list on a browser's first visit.

## Run

Serve the folder with any static file server, then open the local URL in a browser.

## Deploy

Pushes to `main` automatically deploy the static site with the GitHub Actions workflow in `.github/workflows/deploy-pages.yml`.

For the first deployment, open **Settings → Pages** in the GitHub repository and set **Source** to **GitHub Actions**. Then push to `main` or run the workflow manually from the **Actions** tab.
