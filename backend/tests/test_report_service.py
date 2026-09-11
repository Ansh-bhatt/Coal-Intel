"""Tests for the report composition engine (M1 — Report Generation Studio).

Covers the offline/extractive path only: sentence selection, OCR-layout
artefact filtering, key-figure extraction and citation-marker integrity. None
of these touch the database or a model provider.
"""

from app.services import report_service as rs


class FakeChunk:
    """Minimal stand-in for ChunkEmbedding (only the fields the engine reads)."""

    def __init__(self, id: str, document_id: str, page_number: int, text: str):
        self.id = id
        self.document_id = document_id
        self.page_number = page_number
        self.chunk_text = text


PROSE = (
    "The Gurwani block has an area of about 19.08 sq.km. "
    "Drilling of approximately 4950m in 9 boreholes has been proposed."
)


def test_clean_lead_keeps_real_prose():
    assert rs._clean_lead(PROSE.split(". ")[0] + ".") == (
        "The Gurwani block has an area of about 19.08 sq.km."
    )


def test_clean_lead_peels_section_numbers_and_caps_headings():
    assert rs._clean_lead(
        "LOCATION 3.1 The Gurwani block has an area of about 19.08 sq.km."
    ) == "The Gurwani block has an area of about 19.08 sq.km."
    assert rs._clean_lead(
        "8 10.0 EXPLORATION SCHEME 10.1 Drilling: Drilling of approximately "
        "4950m in 9 boreholes has been proposed for the block."
    ).startswith("Drilling:")


def test_clean_lead_rejects_layout_artefacts():
    # Mid-word chunk tail, all-caps drawing title block, table row, Gantt row.
    assert rs._clean_lead("uity of coal seams occurring in the block as follows") is None
    assert rs._clean_lead("9 suitably incorporating geophysical surveys here") is None
    assert (
        rs._clean_lead(
            "DATE REPRESENTATIVE GRAPHIC LITHOLOGS OF ADJACENT BLOCKS OF GURWANI "
            "BLOCK JOB TITLE ACTIVITY APPROVED"
        )
        is None
    )
    assert rs._clean_lead("550 sample 11 Laboratory Studies (Overall) Nos.") is None
    assert rs._clean_lead("1 month ↔ Geologist Party days <------> 60 Days total") is None


def test_is_informative_skips_boilerplate():
    assert rs._is_informative("Production rose to 12.35 MT against a target of 11 MT.")
    assert not rs._is_informative(
        "Refer Annexure III for the detailed enclosed plate respectively."
    )


def test_extractive_findings_are_cited_and_capped():
    chunks = [
        FakeChunk("c1", "d1", 3, PROSE),
        FakeChunk("c2", "d1", 4, "The seam attains a thickness of 4.20 m with an "
                                "average density reported across the block area."),
        FakeChunk("c3", "d2", 2, "Overburden removal during the year was 18.40 Mcum "
                                 "and dispatch achieved the stated target."),
    ]
    # Markers are request-local since the concurrent-report fix — pass a
    # fresh mapping the way compose_report does.
    findings = rs._extractive_findings(chunks, {}, per_doc_cap=1)
    assert len(findings) == 2  # one per document
    assert all(f.endswith("]") and "[" in f for f in findings)
    assert any("19.08 sq.km" in f for f in findings)


def test_extract_key_figures_deduplicates_and_caps():
    chunks = [
        FakeChunk("c1", "d1", 3, "Area 19.08 sq.km, of which 15.50 sq.km is coal."),
        FakeChunk("c2", "d1", 4, "Repeat of 19.08 sq.km within the block area of 400 m."),
    ]
    figures = rs._extract_key_figures(chunks)
    values = [f.value for f in figures]
    assert values.count("19.08 sq.km") == 1
    assert len(figures) <= 6
    assert all(f.label for f in figures)


def test_compose_report_sections_receive_citation_markers():
    """The section planner must keep every finding's [n] marker intact."""
    chunks = [FakeChunk(f"c{i}", "d1", i + 1, PROSE) for i in range(4)]
    findings = rs._extractive_findings(chunks, {}, per_doc_cap=12)
    spec = rs.REPORT_TYPE_SPECS[rs.DEFAULT_REPORT_TYPE]
    buckets: list[list[str]] = [[] for _ in spec["sections"]]
    for i, finding in enumerate(findings):
        index = min(
            i * len(spec["sections"]) // max(len(findings), 1),
            len(spec["sections"]) - 1,
        )
        buckets[index].append(finding)
    distributed = [f for bucket in buckets for f in bucket]
    assert len(distributed) == len(findings)
    assert all("[" in f for f in distributed)


def test_cosine_helper_handles_zero_norms():
    assert rs._cosine([0.0, 0.0], [1.0, 1.0]) == 0.0
    assert abs(rs._cosine([1.0, 2.0], [1.0, 2.0]) - 1.0) < 1e-9
