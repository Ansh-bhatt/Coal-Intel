# 03_Architecture.md

## Overview & System Topology
The application follows a client-side modern Web application pattern leveraging Next.js App Router. The UI architecture is split across two core operational environments: the Executive Search Studio and the Subsidiary Data Ingestion Hub. State synchronization across layout boundaries and component trees is managed via a centralized Zustand store.

---

## Frontend Component Tree & Hierarchy

* **app/**
  * **layout.tsx**: Root layout configuring typography providers (`Inter`, `Space Grotesk`, `JetBrains Mono`), global context wrappers, and the base cream editorial background container.
  * **page.tsx**: Executive landing page featuring editorial hero layout, system latency metrics, engine status tag, and entry cards for both portals.
  * **login/**
    * **page.tsx**: Unified authentication view supporting role selection (Executive Access vs. Subsidiary Field Operative).
  * **executive/**
    * **page.tsx**: Executive Search Studio layout container managing split-screen layout state.
    * **components/**
      * **HeaderNav.tsx**: Top navigation bar featuring CIL/CMPDI enterprise branding, active user pill, and global portal mode toggle switch.
      * **ChatInterface.tsx**: Conversational querying component handling user input, suggested prompt pills, and real-time message streaming.
      * **ResponseCard.tsx**: Message renderer for dynamic markdown responses and clickable source citation tags.
      * **PdfSplitViewer.tsx**: PDF document viewer consuming `pdfjs-dist` alongside the chat pane with interactive citation target rendering.
      * **BoundingBoxOverlay.tsx**: High-contrast canvas overlay engine rendering rectangular bounds over document coordinates.
      * **ParliamentaryDraftModal.tsx**: Export preview modal supporting formal response generation and downloadable file stubs (PDF/DOCX).
  * **ingestion/**
    * **page.tsx**: Subsidiary Data Ingestion Hub layout container.
    * **components/**
      * **FileDropzone.tsx**: Drag-and-drop document upload container restricted to PDF, XLSX, and DOCX formats.
      * **MetadataForm.tsx**: Input panel capturing reporting metadata including Subsidiary, Coalfield, Data Category, and Fiscal Year.
      * **VerificationGrid.tsx**: Human-in-the-Loop tabular verification grid with inline-editable inputs highlighting low-confidence OCR extractions.
  * **analytics/**
    * **page.tsx**: Executive analytics dashboard layout.
    * **components/**
      * **MetricCard.tsx**: Visual indicator cards displaying operational metrics, throughput, and accuracy scores.
      * **WordCloud.tsx**: Visual vector keyphrase cloud component displaying extracted terminology trends.

---

## State Management Architecture (Zustand)

### Active Portal State
* **State Field**: `activePortal` (`EXECUTIVE` | `INGESTION`)
* **Purpose**: Tracks the global navigational context. Toggling this state updates top header branding cues, adjusts global route scope, and switches navigation parameters.

### PDF & Citation State
* **State Field**: `pdfUrl` (string | null)
* **Purpose**: Holds the active target document path or binary stream rendered inside the split-screen PDF pane.
* **State Field**: `activeCitation` (Citation Object | null)
* **Purpose**: Stores the selected citation metadata required by the overlay canvas engine.
* **Citation Data Structure**:
  * **id**: Unique string identifier for the target source reference.
  * **documentName**: Original source filename for display.
  * **pageNumber**: Target page number inside the active document.
  * **boundingBox**: Bounding coordinate set defined by top-left (`x1`, `y1`) and bottom-right (`x2`, `y2`) values.

### Ingestion & Verification State
* **State Field**: `uploadedFiles` (Array of File objects)
* **Purpose**: Staging store for files queued for metadata tagging and extraction processing.
* **State Field**: `extractedRecords` (Array of Record objects)
* **Purpose**: Data store housing machine-extracted key-value pairs, OCR confidence scores, and verification status tags for human review prior to backend database commit.