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

export const SAMPLE_PDF_URL = "/sample-report.pdf";

export const SAMPLE_DOCUMENT_NAME = "Coal_India_Production_Report_Q4.pdf";

/** Citations pointing at regions of the bundled sample PDF (page 1). */
export const MOCK_CITATIONS: Citation[] = [
  {
    id: "cit-001",
    documentName: SAMPLE_DOCUMENT_NAME,
    pageNumber: 1,
    boundingBox: { x1: 62, y1: 120, x2: 350, y2: 152 },
  },
  {
    id: "cit-002",
    documentName: SAMPLE_DOCUMENT_NAME,
    pageNumber: 1,
    boundingBox: { x1: 62, y1: 175, x2: 402, y2: 205 },
  },
  {
    id: "cit-003",
    documentName: SAMPLE_DOCUMENT_NAME,
    pageNumber: 1,
    boundingBox: { x1: 62, y1: 240, x2: 330, y2: 268 },
  },
  {
    id: "cit-004",
    documentName: SAMPLE_DOCUMENT_NAME,
    pageNumber: 1,
    boundingBox: { x1: 62, y1: 305, x2: 260, y2: 332 },
  },
];

export const SUGGESTED_PROMPTS: string[] = [
  "Summarise Q4 FY24 raw coal production by subsidiary",
  "Compare CIL output against the revised target",
  "List top coalfields by overburden removal",
  "Draft a parliamentary response on dispatch growth",
];

const markdownTemplate = `
### Executive Brief — Raw Coal Production

The consolidated **raw coal production** for Q4 FY24 reached **217.9 MT**, registering a year-on-year growth of **6.4%**. All seven producing subsidiaries contributed to the uptick, led by MCL and SECL.

| Subsidiary | Production (MT) | YoY Δ |
| --- | --- | --- |
| MCL | 51.2 | +7.8% |
| SECL | 48.6 | +6.1% |
| NCL | 34.4 | +5.4% |
| WCL | 26.1 | +4.9% |

**Key drivers**: augmentation of overburden removal capacity, first-mile connectivity projects, and higher rakes per day at major sidings.

> Figures are provisional and subject to final accounting.
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
