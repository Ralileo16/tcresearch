# Thaumcraft Research Helper

[Live site](https://Ralileo16.github.io/tcresearch/)

A dark, arcane-themed research helper for Thaumcraft 5.2. Pick the two aspects
at the edges of a research note and it finds the shortest path (honoring the
minimum number of blank cells) connecting them, routing around aspects you
don't have yet.

## Development

Requires Node.js 20+.

```sh
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # serve the production build
npm run lint      # oxlint
```

## Structure

- `src/data/` — version recipes, addon aspects, aspect name/image translation
- `src/lib/search.js` — graph construction + weighted path search
- `src/components/` — React UI
- `public/aspects/` — aspect icons (color = available, mono = locked)

## Deploying

Pushing to `main` triggers a GitHub Actions workflow that builds the app and
publishes `dist/` to the `gh-pages` branch, where GitHub Pages serves it at
`/tcresearch/`.