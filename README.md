# The house unfolds

Minimal standalone Three.js + React study for room placement and card draws.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` and `npm run preview` are available if needed; no typechecking is attached to these scripts.

## Controls

- Click a gold doorway ring to draw a room. Rotate with Q/E or buttons, Enter to place, Escape to cancel.
- Room icons automatically draw cards. Use the three deck buttons or physical deck stacks for manual draws.
- Dismiss a revealed card to continue; replay repeats the last draw without consuming another card.
- Switch floors using the upper-left buttons. Drag to orbit, right-drag to pan, scroll to zoom.
- Reset restores the house and reshuffles all decks. Recenter restores the view of the current floor.

## Boundaries

Procedural room props, no external models. Room and card data is a display-only snapshot of `betrayal-house-on-the` at `a965416`, from `packages/shared/src/{tiles,cards}.data.ts`. The snapshot contains the 42 drawable rooms, starting tiles, landings, and all three card decks. Update the snapshot manually when the source changes.

Only placement and draw presentation are simulated. There is no server, persistence, player movement, combat, monster/token system, effect resolution, or haunt logic. Floor switching is unrestricted. All dismissed cards leave the scene regardless of their actual keep rules. The card mesh shows an excerpt of long rules; the inspection panel contains full text and roll tables. Furniture is shared between room categories, not a bespoke model for every tile.

Tests, typechecking, builds, and browser/runtime verification were intentionally not run for this POC.
