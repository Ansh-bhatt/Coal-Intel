# 01_Implementation_Plan.md

## Scope & Prerequisites
* Target environment: Client-side Next.js App Router with Tailwind CSS and Inter / Space Grotesk / JetBrains Mono font integration.
* Shared UI Components: Radix UI / Shadcn UI primitives for modals, tooltips, and responsive layout elements.
* Visual Styling Theme: Cream/Warm Alabaster editorial canvas aesthetic (`#F4F3EF`), deep ink text (`#111111`), subtle borders (`border-black/10`), and pill-shaped interactive components.
* State Management: Zustand store for dynamic active portal state, user authentication session states, and PDF view context.

## Implementation Tasks

### Core Architecture & App Shell
* Build global layout frame (`/app/layout.tsx`) with dynamic font classes applied (`font-sans`, `font-mono`, `font-display`) and cream background base canvas.
* Implement Top Navigation Header containing CIL / CMPDI enterprise branding, active user avatar/role badge, and a dynamic mode switch toggle: `Executive Studio` vs. `Subsidiary Ingestion Hub`.

### Landing Page & Portal Choice
* Implement `/` (Root Landing Page) featuring an executive hero section inspired by editorial canvas layouts, dynamic status badges (`V2.4 ENGINE LIVE`), animated system metrics, and dual interactive feature cards.
* Integrate pill-style quick-access action buttons on each card navigating to `/login?portal=executive` and `/login?portal=subsidiary`.

### Authentication & Access Control
* Create `/login` page supporting both role models:
  * Executive Search Studio: Federated single sign-on (SSO) or Executive Credentials.
  * Subsidiary Ingestion Hub: Field Operational Personnel login with Subsidiary and Coalfield scope selection.

### Portal 1: Executive Search Studio (`/executive`)
* **Natural Language Chat Component**: Build chat input box with prompt suggestion pills, real-time message stream container, and structured response cards styled with crisp monochrome borders.
* **Split-Screen PDF Viewer Component**: Integrate `pdfjs-dist` to render multi-page documents alongside the chat context.
* **Interactive Citation Bounding Box Overlay**: Implement canvas coordinate rendering engine to draw translucent overlays over `bounding_box` coordinates `[x1, y1, x2, y2]` on citation tag selection.
* **Parliamentary Response Draft Generator**: Build document preview modal populated with generated responses and export triggers (PDF & DOCX format handlers).

### Portal 2: Subsidiary Ingestion Hub (`/ingestion`)
* **Drag-and-Drop Ingestion Zone**: Implement file drag-and-drop zone using `react-dropzone` restricted to `.pdf`, `.xlsx`, and `.docx` file types with upload progress tracking.
* **Metadata Input Form**: Build structured dropdown form capturing `Subsidiary`, `Coalfield`, `Category`, and `Reporting Year`.
* **Human-in-the-Loop Verification Grid**: Build an editable data grid highlighting low-confidence OCR text extractions in high-contrast red inputs, permitting instant manual correction.

### Analytics Dashboard (`/analytics`)
* Implement Responsive Metric Cards (Ingestion Volume, Accuracy Metric, Operational Throughput).
* Implement SVG Word Cloud visualization component consuming keyphrase arrays using `d3-cloud` or SVG rendering wrappers.