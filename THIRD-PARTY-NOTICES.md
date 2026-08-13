# Third-Party Notices

## OpenTakeoff (Apache-2.0)

PAAX's PDF tile-pyramid, worker-pool lifecycle, OffscreenCanvas worker
architecture, detail-overlay rendering model, and render constants/scale
math adapt concepts and, where useful, code structure from
[OpenTakeoff](https://github.com/Kentucky-ai/opentakeoff), copyright its
contributors, licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

**NOTICE:** Per the Apache-2.0 NOTICE requirement, the upstream notice is
reproduced here and the authoritative copy is referenced at
`G:\opentakeoff-main\NOTICE`:

> OpenTakeoff
> Copyright 2026 Kentucky AI and the OpenTakeoff contributors

The adapted PAAX files are:

- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-render-constants.ts`
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-scale-math.ts`
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-protocol.ts`
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-detail-overlay.tsx`
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pyramid.ts`
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile-pool.ts`
- `apps/web/src/components/drawing-intelligence/workspace/canvas/pdf-tile.worker.ts`

## pdf.js (`pdfjs-dist`)

PAAX distributes and uses `pdfjs-dist` version 4.10.38 for browser-side PDF
range loading and rendering. pdf.js is maintained by Mozilla contributors and
is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
Source: [mozilla/pdf.js](https://github.com/mozilla/pdf.js).
