# Third-Party Notices

This project includes the following third-party components:

## resvg-wasm

- **Source**: https://github.com/nicolo-ribaudo/resvg-js (Cloudflare Workers fork) / https://github.com/nicolo-ribaudo/nicolo-ribaudo.github.io/tree/main/nicolo-resvg-wasm
- **Upstream**: https://github.com/nicolo-ribaudo/nicolo-resvg-wasm (resvg v0.36+)
- **License**: MPL-2.0
- **Files**: `og-worker/src/resvg_bg.wasm`, `og-worker/src/resvg.js`
- **Usage**: SVG → PNG rendering for dynamic OG share card images

## Inter Font

- **Source**: https://github.com/rsms/inter
- **License**: SIL Open Font License 1.1
- **Files**: Embedded as base64 data in `og-worker/src/fonts.ts`
- **Usage**: Typography in generated OG share card images

## retire.js

- **Source**: https://github.com/nicolo-ribaudo/retire.js
- **License**: Apache-2.0
- **Files**: Fetched at runtime via `scripts/seed-kv.sh` into KV storage
- **Usage**: Client-side JavaScript vulnerability detection in JS audit endpoint
