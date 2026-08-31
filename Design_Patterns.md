# 02_Design_Patterns.md

## UI/UX & Structural Patterns

### 1. Dual-Portal Shell Switch Pattern
* **Intent**: Provide seamless navigation between executive analytical querying and operational data entry without full page reloads.
* **Implementation**: Maintained via a global Zustand state store (`usePortalStore`) tracking active mode (`EXECUTIVE` | `INGESTION`) and mirroring state in the top header toggle switch.

### 2. Dual-Pane Citation Coordinates Viewer Pattern
* **Intent**: Bridge conversational output with source document verification through exact PDF bounding box highlighting.
* **Implementation**: 
  * Left Pane: Chat thread rendering Markdown responses containing interactive `<CitationTag id={sourceId} bbox={coordinates} page={pageNum} />` components.
  * Right Pane: Canvas overlay layer rendered directly over the `pdfjs-dist` canvas element.
  * Event Flow: Clicking a citation emits an event -> Right pane PDF viewer navigates to target page -> Canvas draws a translucent rectangle over coordinates `[x1, y1, x2, y2]`.

### 3. Human-in-the-Loop (HITL) Verification Pattern
* **Intent**: Guarantee data integrity for machine-extracted OCR tables before database commit.
* **Implementation**:
  * Grid Component consumes extracted key-value pairs along with confidence scores ($0.0 - 1.0$).
  * Threshold Engine evaluates confidence scores; values below threshold ($\text{confidence} < 0.85$) are visually flagged with a high-contrast red border/background.
  * Inputs remain inline-editable, allowing manual correction prior to triggering final batch ingestion.

## Design & Typography Tokens (Editorial Warm Theme)

### Typography Configuration
* Primary Sans: `Inter` (UI elements, body paragraphs, data tables)
* Modern Display: `Space Grotesk` (Large hero headlines, display titles)
* Monospace: `JetBrains Mono` (Engine status tags, metric indicators, coordinates, query parameters)

### Color Palette (Tailwind & Hex Tokens)
* Canvas Background: `bg-[#F4F3EF]` (Warm Alabaster / Cream)
* Primary Typography: `text-[#111111]` (Deep Ink Black)
* Engine & Status Tag Accent: `text-[#F24E1E]` (Vibrant Coral / Orange)
* Structural Borders: `border-black/10` or `border-[#D8D5CC]` (Thin 1px Subtle Dividers)
* Primary Pill Buttons: `bg-[#111111] hover:bg-black text-white rounded-full`
* Highlight Cyan (Citations): `bg-cyan-500/20`, `border-cyan-500`, `shadow-[0_0_15px_rgba(6,182,212,0.3)]`
* Low-Confidence Alert: `bg-rose-500/10`, `text-rose-600`, `border-rose-500`