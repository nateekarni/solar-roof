/** Offline, frozen-input-only renderer evidence; no runtime or database access. */
import {
  refinementFixtures,
  layoutDocumentPages,
} from "./document-layout.test-fixtures.js";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderDocumentPdf } from "./document-layout.js";
const output = process.argv[2];
if (!output) throw new Error("Provide the fixture output directory");
const dir = resolve(output);
await mkdir(dir, { recursive: true });
for (const [name, snapshot] of Object.entries(refinementFixtures())) {
  const pages = layoutDocumentPages(snapshot);
  await writeFile(join(dir, `${name}.pdf`), await renderDocumentPdf(snapshot));
  await writeFile(
    join(dir, `${name}.snapshot.json`),
    JSON.stringify(snapshot, null, 2),
  );
  console.log(`${name}: ${pages.length} pages`);
}
