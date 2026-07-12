"""Generate sample resume fixtures (DOCX via python-docx, PDF via raw PDF syntax)."""

from pathlib import Path

from docx import Document

HERE = Path(__file__).parent

RESUME_LINES = [
    "Priya Sharma",
    "Bengaluru, India | priya.sharma@example.com | +91 98765 43210",
    "linkedin.com/in/priyasharma | github.com/priyasharma",
    "Summary",
    "Senior software engineer with 6+ years of experience building backend services.",
    "Experience",
    "Senior Software Engineer at Acme Corp | Jan 2022 - Present",
    "Built payment microservices in Python and Go serving 2M users.",
    "Software Engineer at Initech | Jun 2019 - Dec 2021",
    "Developed REST APIs with Django and PostgreSQL.",
    "Education",
    "B.Tech Computer Science, IIT Delhi, 2019",
    "Skills",
    "Python, Go, Django, PostgreSQL, Docker, Kubernetes, AWS, Kafka",
    "Certifications",
    "AWS Certified Solutions Architect, 2023",
    "Languages",
    "English, Hindi",
]


def make_docx() -> None:
    doc = Document()
    for line in RESUME_LINES:
        doc.add_paragraph(line)
    doc.save(HERE / "sample_resume.docx")


def make_pdf() -> None:
    """Hand-write a minimal single-page PDF with Helvetica text."""
    content_lines = []
    y = 780
    for line in RESUME_LINES:
        safe = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        content_lines.append(f"BT /F1 11 Tf 50 {y} Td ({safe}) Tj ET")
        y -= 18
    stream = "\n".join(content_lines).encode()

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"

    xref_pos = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF\n"
    ).encode()

    (HERE / "sample_resume.pdf").write_bytes(bytes(out))


if __name__ == "__main__":
    make_docx()
    make_pdf()
    print("fixtures written")
