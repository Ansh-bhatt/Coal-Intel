# 04_Phases.md

## Frontend Development Phases

### Phase 1: Repository Setup & Design System Foundations
* Initialize Next.js repository with App Router, Tailwind CSS, and TypeScript.
* Configure editorial color tokens (`#F4F3EF` base background, `#111111` deep ink text, `#F24E1E` accent tag) and custom typography (`Space Grotesk`, `Inter`, `JetBrains Mono`).
* Set up global Zustand state management store for active portal modes and PDF viewer triggers.
* Build shared top header navigation component with CIL/CMPDI enterprise branding and global toggle switch.

### Phase 2: Landing Page, Dual Portals Entry & Authentication
* Build editorial hero landing page featuring clean typography, status indicators (`V2.4 ENGINE LIVE`), structural dividers (`border-black/10`), pill buttons (`rounded-full`), and dual portal selection cards.
* Build multi-portal `/login` screen supporting role-based selection and simulated authentication flows.
* Implement layout wrappers and route guards for `/executive` and `/ingestion` pathways.

### Phase 3: Portal 1 (Executive Search Studio) Implementation
* Implement natural language chat interface with prompt suggestion pills and streaming response message cards styled for high readability.
* Integrate `pdfjs-dist` split-screen viewer side-by-side with the conversational interface.
* Construct the dynamic Canvas overlay system to render glowing bounding box highlights (`[x1, y1, x2, y2]`) upon clicking citation tags.
* Build the Parliamentary Response Draft Generator modal equipped with stubbed PDF/DOCX file export functions.

### Phase 4: Portal 2 (Subsidiary Ingestion Hub) Implementation
* Construct the drag-and-drop file upload zone supporting PDF, XLSX, and DOCX extensions.
* Build the Metadata Form with selectors for Subsidiary, Coalfield, Category, and Reporting Year.
* Build the Human-in-the-Loop (HITL) verification table grid with inline-editable inputs highlighting low-confidence OCR scores in red.

### Phase 5: Executive Analytics Dashboard & UI Polish
* Implement responsive analytics metric cards for overall system throughput and ingestion metrics.
* Build SVG Word Cloud visualizer using `d3-cloud` / custom SVG canvas consuming keyword arrays.
* Apply micro-interactions, subtle borders, paper texture accents, and visual refinements across both portals.