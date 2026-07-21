# Alkane

A web app for practising organic molecule drawing and nomenclature. Draw a
structure, get its IUPAC name from the [Organic-Namer-Engine](https://github.com/aarianmm/Organic-Namer-Engine)
API, edit the structure, see the name update.

## Stack

- React + TypeScript + Vite
- Custom SVG molecule editor (no diagramming library)
- The molecule is a graph (`src/graph`); SVG only renders it

## Structure

```
src/
  graph/       Molecule graph model — the editor's source of truth
  editor/      SVG editor and toolbar
  components/  Supporting UI (name display, etc.)
  api/         Naming API client and wire types
```

## Getting started

```bash
npm install
cp .env.example .env   # point VITE_NAMING_API_URL at the naming API
npm run dev
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run lint` — run ESLint
- `npm run preview` — preview the production build locally
