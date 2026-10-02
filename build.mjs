import { build } from "esbuild";
import { mkdir, cp, readFile, writeFile, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
const options = {
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  legalComments: "eof",
  plugins: [
    {
      name: "mv3-no-inline-proxy",
      setup(b) {
        b.onLoad({ filter: /darkreader\.m?js$/ }, async (args) => {
          let source = await readFile(args.path, "utf8");
          const pattern =
            /\{\s*const proxyScript = createOrUpdateScript\("darkreader--proxy"\);[\s\S]*?proxyScript\.remove\(\);\s*\}/;
          if (
            !source.includes("nativeSendMessage.apply(chrome.runtime, args);")
          )
            throw Error("Dark Reader messaging guard needs review");
          if (!pattern.test(source))
            throw Error("Dark Reader proxy patch needs review");
          return {
            contents: source
              .replace(
                "nativeSendMessage.apply(chrome.runtime, args);",
                `if (!chrome.runtime.id) return;
               try { nativeSendMessage.apply(chrome.runtime, args); }
               catch (error) { if (!String(error).includes('Extension context invalidated')) throw error; }`,
              )
              .replace(
                pattern,
                "/* Afterglow: inline proxy omitted for Manifest V3 CSP. */",
              ),
            loader: "js",
          };
        });
      },
    },
  ],
};
await build({ ...options, entryPoints: ["src/background.ts", "src/popup.ts"] });
await build({
  ...options,
  entryPoints: ["src/content.ts"],
  banner: {
    js: `(() => {
  const session = globalThis.__afterglowSession;
  if (session?.isAlive()) return;
  session?.dispose();
  document.dispatchEvent(new Event('afterglow:dispose'));`,
  },
  footer: { js: "})();" },
});
await writeFile(
  "dist/THIRD_PARTY_LICENSES.txt",
  await readFile("node_modules/darkreader/LICENSE"),
);
