/** Create an offline HTML game and a portable ZIP, using only Node's standard library. */
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] ?? join(root, "release"));
const dist = join(root, "dist");
const thirdPartyNotices = [
  "THIRD-PARTY NOTICES — ÚLTIMA ZONA",
  "The portable game includes Three.js and Vite's modulepreload runtime polyfill.",
  "=== Three.js ===",
  await readFile(join(root, "node_modules/three/LICENSE"), "utf8"),
  "=== Vite (MIT license, including its runtime polyfill) ===",
  (await readFile(join(root, "node_modules/vite/LICENSE.md"), "utf8"))
    .split("# Licenses of bundled dependencies")[0]
    .trim(),
].join("\n\n");
let html = await readFile(join(dist, "index.html"), "utf8");
const scripts = [
  ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi),
];
if (scripts.length !== 1)
  throw new Error(
    "Expected one production JS bundle; run npm run build first.",
  );
function assetPath(url) {
  if (!url.startsWith("/") && !url.startsWith("./"))
    throw new Error("Unsupported external asset: " + url);
  const file = resolve(dist, url.replace(/^\.?\//, ""));
  const rel = relative(dist, file);
  if (rel.startsWith("..") || isAbsolute(rel))
    throw new Error("Asset escapes dist");
  return file;
}
const javascript = await readFile(assetPath(scripts[0][1]), "utf8");
// Fail rather than shipping a seemingly portable game with unresolved module fetches.
if (/\bimport\s*(?:\(|["']|[^;\n]*\bfrom\s*["'])/.test(javascript))
  throw new Error(
    "Production bundle contains module imports; configure a single bundle before packaging.",
  );
html = html.replace(
  scripts[0][0],
  () =>
    `<script type="module">\n${javascript.replace(/<\/script/gi, "<\\/script")}\n</script>`,
);
const styles = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)];
for (const style of styles) {
  const href = style[0].match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) throw new Error("Missing stylesheet path");
  const css = await readFile(assetPath(href), "utf8");
  if (/url\s*\(|@import\b/i.test(css))
    throw new Error(
      "Stylesheet contains external assets; embed them before packaging.",
    );
  html = html.replace(
    style[0],
    () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
  );
}
if (
  /<(?:script|link)\b[^>]*(?:src|href)=["'](?:https?:|\/assets\/)/i.test(html)
)
  throw new Error("Unresolved external asset in standalone document.");
// Carry runtime licenses even when the HTML is distributed independently of the ZIP.
html = html.replace(
  "</head>",
  () => `<!--\n${thirdPartyNotices.replace(/-->/g, "--&gt;")}\n-->\n</head>`,
);
const help = `ÚLTIMA ZONA — VERSÃO PORTÁTIL\n\nCOMO JOGAR\n1. Extraia o ZIP completo para uma pasta do computador.\n2. Abra JOGAR.html com Google Chrome, Microsoft Edge ou Firefox atualizado.\n3. Pressione Jogar agora. Permita a captura do mouse quando o navegador pedir.\n\nNão precisa instalar Node.js, abrir terminal ou manter conexão com a internet.\nO jogo é single-player e todos os adversários são bots.\n\nCONTROLES\nWASD: mover; mouse: olhar; clique esquerdo: atirar; direito: mirar.\nShift: correr; Ctrl: agachar; Espaço: pular.\nE: coletar; R: recarregar; F: curar; 1–5: selecionar armas coletadas.\nTab: inventário; M: mapa; Esc: pausar/liberar mouse.\n\nSE NÃO ABRIR\nUse um navegador desktop com WebGL2 e aceleração de hardware ativada.\nNão abra a página dentro da visualização do ZIP, e sim após extrair.\nSe o navegador não capturar o mouse, clique na tela e pressione Continuar.\nEm computador mais lento, escolha qualidade Baixo nas configurações.\nFechar a aba encerra o jogo. Não há instalação de serviços ou gravação de partidas.\n\nO diretório codigo-fonte contém o projeto para desenvolvimento.\nConsulte codigo-fonte/README.md para requisitos, testes e limitações atuais.\nA versão empacotada é uma primeira versão jogável com modelos e áudio procedurais.\n`;

const entries = [
  { name: "Ultima-Zona/JOGAR.html", data: Buffer.from(html) },
  { name: "Ultima-Zona/LEIA-ME.txt", data: Buffer.from(help) },
  {
    name: "Ultima-Zona/THIRD-PARTY-NOTICES.txt",
    data: Buffer.from(thirdPartyNotices),
  },
];
const include = [
  "src",
  "scripts",
  "tests",
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "index.html",
  ".gitignore",
  ".npmrc",
];
for (const item of include) {
  const file = join(root, item);
  // Every declared source file is required. Incomplete packages must fail loudly.
  await collect(file, item);
}
async function collect(file, name) {
  const info = await stat(file);
  if (info.isDirectory()) {
    for (const child of (await readdir(file)).sort())
      await collect(join(file, child), name + "/" + child);
  } else
    entries.push({
      name: "Ultima-Zona/codigo-fonte/" + name,
      data: await readFile(file),
    });
}
// ZIP format (stored entries, UTF-8 filenames). No system zip or third-party package required.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const parts = [],
  central = [];
let offset = 0;
for (const entry of entries) {
  const name = Buffer.from(entry.name),
    crc = crc32(entry.data),
    local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(0x21, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(entry.data.length, 18);
  local.writeUInt32LE(entry.data.length, 22);
  local.writeUInt16LE(name.length, 26);
  parts.push(local, name, entry.data);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0x800, 8);
  record.writeUInt16LE(0x21, 14);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(entry.data.length, 20);
  record.writeUInt32LE(entry.data.length, 24);
  record.writeUInt16LE(name.length, 28);
  record.writeUInt32LE(offset, 42);
  central.push(record, name);
  offset += local.length + name.length + entry.data.length;
}
const directory = Buffer.concat(central),
  end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...parts, directory, end]);
// Do not create a new release until all required source files and licenses were read.
await mkdir(output, { recursive: true });
await writeFile(join(output, "JOGAR.html"), html);
await writeFile(join(output, "LEIA-ME.txt"), help);
await writeFile(join(output, "THIRD-PARTY-NOTICES.txt"), thirdPartyNotices);
await writeFile(join(output, "Ultima-Zona.zip"), zip);
const hash = createHash("sha256").update(zip).digest("hex");
await writeFile(join(output, "SHA256SUMS.txt"), `${hash}  Ultima-Zona.zip\n`);
console.log(
  `Portable HTML: ${join(output, "JOGAR.html")}\nZIP: ${join(output, "Ultima-Zona.zip")} (${zip.length} bytes, ${entries.length} files)\nSHA-256: ${hash}`,
);
