// Build script for the Yoke client using Bun's native bundler + Tailwind CSS v4
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import tailwind from "bun-plugin-tailwind";

const outdir = join(import.meta.dir, "dist");
mkdirSync(outdir, { recursive: true });
mkdirSync(join(outdir, "assets"), { recursive: true });

// Build the JS + CSS bundle with Tailwind plugin
const result = await Bun.build({
  entrypoints: [join(import.meta.dir, "src/main.tsx")],
  outdir,
  target: "browser",
  minify: true,
  splitting: false,
  plugins: [tailwind],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  naming: {
    entry: "assets/[name]-[hash].[ext]",
    chunk: "assets/[name]-[hash].[ext]",
    asset: "assets/[name]-[hash].[ext]",
  },
  external: [],
});

if (!result.success) {
  console.error("Build failed:");
  for (const msg of result.logs) {
    console.error(msg);
  }
  process.exit(1);
}

// Find outputs
const jsOutput = result.outputs.find(o => o.path.endsWith(".js"));
const cssOutput = result.outputs.find(o => o.path.endsWith(".css"));

if (!jsOutput) {
  console.error("No JS output found");
  process.exit(1);
}

const jsPath = jsOutput.path.replace(outdir + "/", "");
const cssPath = cssOutput ? cssOutput.path.replace(outdir + "/", "") : null;

// Generate index.html
const cssLink = cssPath ? `<link rel="stylesheet" href="/${cssPath}" />` : "";
const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Yoke — Domain Intelligence</title>
    <meta name="description" content="Instant DNS, SSL, security headers, tech stack, performance, email auth, and business intelligence for any domain." />
    <meta property="og:title" content="Yoke — Domain Intelligence" />
    <meta property="og:description" content="Instant DNS, SSL, security headers, tech stack, performance, email auth, and business intelligence for any domain." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://yoke.lol" />
    <meta property="og:site_name" content="Yoke" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Yoke — Domain Intelligence" />
    <meta name="twitter:description" content="Instant DNS, SSL, security headers, tech stack, performance, email auth, and business intelligence for any domain." />
    <meta name="impact-site-verification" value="5b874e38-4989-4b8a-8544-3030a7b05ced" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚡</text></svg>" />
    ${cssLink}
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/${jsPath}"></script>
  </body>
</html>`;

writeFileSync(join(outdir, "index.html"), html);

console.log("✓ Client build complete");
console.log(`  JS:   ${jsPath}`);
if (cssPath) console.log(`  CSS:  ${cssPath}`);
console.log(`  HTML: index.html`);
console.log(`  Output dir: ${outdir}`);
