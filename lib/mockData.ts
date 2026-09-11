/**
 * Mock / demo data powering the simulated flows.
 * No backend is wired yet — these values stand in for the API layer.
 */

import type {
  Citation,
  ExtractedRecord,
  IngestionMetadata,
  SessionUser,
} from "@/lib/types";

export const SAMPLE_PDF_URL = "/gurwani-block-coal-mp.pdf";

export const SAMPLE_DOCUMENT_NAME =
  "63b810daa71bd17 Gurwani block_Coal_MP.pdf";

/** Citations pointing at regions of the bundled flagship PDF (Gurwani block). */
export const MOCK_CITATIONS: Citation[] = [
  {
    id: "cit-001",
    documentName: SAMPLE_DOCUMENT_NAME,
    pageNumber: 2,
    boundingBox: { x1: 62, y1: 120, x2: 350, y2: 152 },
  },
  {
    id: "cit-002",
    documentName: SAMPLE_DOCUMENT_NAME,
    pageNumber: 5,
    boundingBox: { x1: 62, y1: 175, x2: 402, y2: 205 },
  },
  {
    id: "cit-003",
    documentName: SAMPLE_DOCUMENT_NAME,
    pageNumber: 8,
    boundingBox: { x1: 62, y1: 240, x2: 330, y2: 268 },
  },
  {
    id: "cit-004",
    documentName: SAMPLE_DOCUMENT_NAME,
    pageNumber: 12,
    boundingBox: { x1: 62, y1: 305, x2: 260, y2: 332 },
  },
];

export const SUGGESTED_PROMPTS: string[] = [
  "Summarise the geology of the Gurwani block",
  "How many boreholes and how much drilling are proposed?",
  "Which seams and formations occur in the block?",
  "Draft a parliamentary response on coal exploration",
];

const markdownTemplate = `
### Geological Brief — Gurwani Block (Singrauli Coalfield)

The **Gurwani block** covers about **19.08 sq. km** and is proposed for **G-3 stage exploration** under NMET funding, with **4,950 m of drilling across 9 boreholes**.

| Parameter | Value |
| --- | --- |
| Block area | 19.08 sq. km |
| Proposed drilling | 4,950 m |
| Boreholes | 9 |
| Coalfield | Singrauli (Northern Coalfields Ltd) |

**Exploration objectives**: prove the coal seam occurrences across the block, establish their depth continuity and assess the resource potential of the property.

> Demo placeholder — shown only when the backend is unreachable; not generated
> from your corpus.
`;

export const MOCK_ASSISTANT_RESPONSE = {
  content: markdownTemplate,
  citations: MOCK_CITATIONS,
};

export const MOCK_EXTRACTED_RECORDS: ExtractedRecord[] = [
  { id: "rec-01", key: "Subsidiary", value: "Mahanadi Coalfields Ltd", confidence: 0.99, status: "pending" },
  { id: "rec-02", key: "Coalfield", value: "Talcher", confidence: 0.97, status: "pending" },
  { id: "rec-03", key: "Reporting Year", value: "2023-24", confidence: 0.98, status: "pending" },
  { id: "rec-04", key: "Raw Coal Production (MT)", value: "51.2", confidence: 0.99, status: "pending" },
  { id: "rec-05", key: "Overburden Removal (Mcum)", value: "184.7", confidence: 0.91, status: "pending" },
  { id: "rec-06", key: "Subsidiary Code", value: "MCL-4", confidence: 0.42, status: "flagged" },
  { id: "rec-07", key: "Approved Capital (INR Cr)", value: "3,21", confidence: 0.55, status: "flagged" },
  { id: "rec-08", key: "Pithead Stock (MT)", value: "12.8", confidence: 0.76, status: "flagged" },
];

export const MOCK_METADATA: IngestionMetadata = {
  subsidiary: "Mahanadi Coalfields Ltd",
  coalfield: "Talcher Coalfield",
  category: "Production Statistics",
  fiscalYear: "2023-24",
};

export const MOCK_WORD_CLOUD: Array<{ text: string; value: number }> = [
  { text: "Overburden", value: 96 },
  { text: "Dispatch", value: 88 },
  { text: "First-mile", value: 74 },
  { text: "Rakes/day", value: 71 },
  { text: "Captive", value: 63 },
  { text: "Excavation", value: 58 },
  { text: "Despatch", value: 55 },
  { text: "Sidings", value: 52 },
  { text: "Blending", value: 49 },
  { text: "Stockyard", value: 45 },
  { text: "CHP", value: 41 },
  { text: "Grading", value: 38 },
  { text: "Royalty", value: 33 },
  { text: "Bench", value: 29 },
  { text: "Dragline", value: 26 },
  { text: "Sustenance", value: 24 },
  { text: "Amalgamation", value: 21 },
  { text: "Ash content", value: 19 },
  { text: "Moisture", value: 17 },
  { text: "Calorific value", value: 15 },
];

export const MOCK_EXECUTIVE_USER: SessionUser = {
  name: "A. Bhattacharya",
  role: "EXECUTIVE",
  email: "a.bhattacharya@cil.co.in",
};

export const MOCK_SUBSIDIARY_USER: SessionUser = {
  name: "R. Verma",
  role: "SUBSIDIARY",
  subsidiary: "Mahanadi Coalfields Ltd",
  coalfield: "Talcher Coalfield",
  email: "r.verma@mcl.co.in",
};

export const SUBSIDIARY_OPTIONS = [
  "Eastern Coalfields Ltd",
  "Bharat Coking Coal Ltd",
  "Central Coalfields Ltd",
  "Western Coalfields Ltd",
  "South Eastern Coalfields Ltd",
  "Northern Coalfields Ltd",
  "Mahanadi Coalfields Ltd",
];

export const COALFIELD_OPTIONS = [
  "Talcher Coalfield",
  "Ib Valley Coalfield",
  "Jharia Coalfield",
  "Raniganj Coalfield",
  "Bokaro Coalfield",
  "Korba Coalfield",
  "Singrauli Coalfield",
  "Wardha Valley Coalfield",
];

export const CATEGORY_OPTIONS = [
  "Production Statistics",
  "Overburden Removal",
  "Dispatch & Despatch",
  "Capital Expenditure",
  "Manpower & Safety",
  "Environmental Compliance",
];

export const FISCAL_YEAR_OPTIONS = [
  "2024-25",
  "2023-24",
  "2022-23",
  "2021-22",
  "2020-21",
];

export const DRAFT_DOCUMENT = {
  title: "Unstarred Question No. 1421",
  preamble:
    "Will the Minister of COAL be pleased to state: (a) the raw coal production of CIL subsidiaries during Q4 FY24; and (b) the growth achieved over the corresponding quarter of the previous year?",
  body: `The raw coal production of Coal India Limited during Q4 FY24 stood at 217.9 MT, recording a year-on-year growth of 6.4% over the corresponding quarter of FY23.

Subsidiary-wise, MCL produced 51.2 MT (+7.8%), SECL 48.6 MT (+6.1%), NCL 34.4 MT (+5.4%) and WCL 26.1 MT (+4.9%). The growth was driven by capacity augmentation across overburden removal, first-mile connectivity projects and improved rake availability.`,
  citations: MOCK_CITATIONS,
};
