// SVG → PNG rendering for OG images using resvg-wasm
// In CF Workers, `import foo from "./file.wasm"` gives a WebAssembly.Module

// @ts-ignore — wasm module import handled by wrangler
import resvgWasmModule from "./resvg_bg.wasm";
import { interRegular, interBold } from "./fonts";

// The resvg CJS wrapper (bundled by bun)
// @ts-ignore
const { initWasm, Resvg } = require("./resvg.js");

let ready = false;

export async function svgToPng(svgString: string): Promise<Uint8Array> {
  if (!ready) {
    await initWasm(resvgWasmModule);
    ready = true;
  }

  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width", value: 1200 },
    font: {
      fontBuffers: [interRegular, interBold],
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}
