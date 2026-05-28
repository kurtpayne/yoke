// OG Image Rendering Worker — handles SVG→PNG conversion for share cards
// Deployed as a separate Cloudflare Worker and called via Service Binding
// from the main yoke worker. This isolates the 2.4MB resvg-wasm bundle
// so it only loads on share card requests (<1% of traffic).

import { svgToPng } from "./png-render";

interface RenderRequest {
  svg: string;
  width?: number;
  height?: number;
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Only accept POST /render
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/render") {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const body = await request.json() as RenderRequest;
      if (!body.svg || typeof body.svg !== "string") {
        return new Response(JSON.stringify({ error: "svg string is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const png = await svgToPng(body.svg);

      return new Response(png, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=604800, immutable",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown rendering error";
      console.error("[yoke-og] render error:", message);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
