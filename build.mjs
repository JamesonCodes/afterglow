import { build } from "esbuild";
import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await build({
  entryPoints: ["src/background.ts", "src/content.ts", "src/popup.ts"],
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
          if (!pattern.test(source))
            throw Error("Dark Reader proxy patch needs review");
          return {
            contents: source.replace(
              pattern,
              "/* Afterglow: inline proxy omitted for Manifest V3 CSP. */",
            ),
            loader: "js",
          };
        });
      },
    },
  ],
});
await writeFile(
  "dist/THIRD_PARTY_LICENSES.txt",
  await readFile("node_modules/darkreader/LICENSE"),
);
