/**
 * Generates public/sample-report.pdf — a minimal, valid multi-line PDF that
 * mirrors a CIL quarterly production report. Text is placed at known page
 * coordinates so the citation bounding-box overlay (MOCK_CITATIONS in
 * lib/mockData.ts) lines up visually on page 1.
 *
 * Run: npm run gen:pdf
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../public/sample-report.pdf");

const content = `BT
/F1 20 Tf 62 720 Td (COAL INDIA LIMITED) Tj
/F1 11 Tf 62 700 Td (Ministry of Coal - Q4 FY24 Quarterly Production Report) Tj
0.85 0.85 0.85 rg 62 668 488 1 re f
/F1 14 Tf 62 640 Td (1. Raw Coal Production) Tj
/F1 11 Tf 62 610 Td (Consolidated raw coal production during Q4 FY24 was 217.9 MT,) Tj
/F1 11 Tf 62 595 Td (a year-on-year growth of 6.4% over the corresponding quarter.) Tj
/F1 14 Tf 62 545 Td (2. Subsidiary-wise Performance) Tj
/F1 11 Tf 62 515 Td (MCL produced 51.2 MT; SECL 48.6 MT; NCL 34.4 MT; WCL 26.1 MT.) Tj
/F1 14 Tf 62 465 Td (3. Overburden Removal) Tj
/F1 11 Tf 62 435 Td (Total overburden removal reached 184.7 Mcum across major coalfields.) Tj
/F1 14 Tf 62 385 Td (4. Dispatch & Despatch) Tj
/F1 11 Tf 62 355 Td (Average rake loading improved to 304 rakes per day in March.) Tj
/F1 14 Tf 62 305 Td (5. Capital Expenditure) Tj
/F1 11 Tf 62 275 Td (Approved capital outlay for FY24 was INR 16,500 crore.) Tj
0.85 0.85 0.85 rg 62 90 488 1 re f
/F1 10 Tf 62 66 Td (CIL Internal - Prepared by CMPDI, Data Analytics Wing) Tj
ET`;

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
];

let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((obj, i) => {
  offsets.push(Buffer.byteLength(pdf, "latin1"));
  pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
});
const xrefStart = Buffer.byteLength(pdf, "latin1");

pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (let i = 0; i < objects.length; i++) {
  pdf += `${String(offsets[i + 1]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, Buffer.from(pdf, "latin1"), "binary");
console.log(`Wrote ${OUT} (${pdf.length} bytes)`);
