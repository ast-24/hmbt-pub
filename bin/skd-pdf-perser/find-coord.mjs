import fs from "fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import params from "./params.mjs";

function parseArgs(argv) {
  const args = [...argv];
  const exact = args.includes("--exact");
  const caseSensitive = args.includes("--case-sensitive");

  const filtered = args.filter((arg) => !arg.startsWith("--"));
  const pdfPath = filtered[0];
  const needle = filtered[1];

  if (!pdfPath || !needle) {
    console.error(
      '使い方: node index3.mjs <PDFファイルパス> "検索文字列" [--exact] [--case-sensitive]',
    );
    process.exit(1);
  }

  return {
    pdfPath,
    needle,
    exact,
    caseSensitive,
  };
}

function matchText(text, needle, { exact, caseSensitive }) {
  const src = caseSensitive ? text : text.toLowerCase();
  const tgt = caseSensitive ? needle : needle.toLowerCase();
  return exact ? src === tgt : src.includes(tgt);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const pdfData = fs.readFileSync(options.pdfPath);
  const pdf = await new pdfjs.getDocument({ data: new Uint8Array(pdfData) })
    .promise;

  const matches = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const contents = await page.getTextContent();

    for (const item of contents.items) {
      const text = (item.str || "").trim();
      if (!text) continue;

      if (!matchText(text, options.needle, options)) continue;

      const x_coord = item.transform[4];
      const width = item.width;

      matches.push({
        page: pageNum,
        text,
        x_coord,
        width,
        x_end: x_coord + width,
        y_coord: item.transform[5],
        height: item.height,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        pdf_name: params.pdf_name,
        needle: options.needle,
        exact: options.exact,
        case_sensitive: options.caseSensitive,
        count: matches.length,
        matches,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
