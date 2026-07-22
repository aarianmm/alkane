# Alkane

A web app for practising organic molecule drawing and nomenclature. Draw a
structure, get its IUPAC name from the [Organic-Namer-Engine](https://github.com/aarianmm/Organic-Namer-Engine)
API, edit the structure, see the name update.

See `Alkane-Implementation-Plan.md` (one level up, alongside
`Web-App-Requirements.md`) for the full design and build order.

## Stack

- React + TypeScript + Vite (scaffolded from the official `react-ts` template)
- Vitest for unit tests
- Custom SVG molecule editor — no diagramming library
- The molecule is a graph (`src/graph`); SVG only renders it

## Getting started

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run lint` — run ESLint
- `npm test` — run the Vitest suite
- `npm run preview` — preview the production build locally
