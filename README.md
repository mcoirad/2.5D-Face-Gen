# Test Face

A small static prototype for experimenting with a 2.5D SVG anime face rig and feature sliders.

## Files

- `index.html` contains the page structure.
- `src/styles.css` contains layout and visual styling.
- `src/main.js` boots the app and wires the controls.
- `src/params.js` contains defaults and slider metadata.
- `src/rig.js` solves face landmarks from the current parameters.
- `src/svgRenderer.js` renders solved landmarks as SVG.
- `src/geometry.js` contains projection and interpolation helpers.

## Run

Serve the folder with any static file server, then open the local URL in a browser.
