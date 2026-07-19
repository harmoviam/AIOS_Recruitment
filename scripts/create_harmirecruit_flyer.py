#!/usr/bin/env python3
"""One-page HarmiRecruit sales flyer (A4)."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color, white

# Palette (match the pitch deck)
NAVY = Color(0x0B / 255, 0x1F / 255, 0x33 / 255)
NAVY_MID = Color(0x12 / 255, 0x2F / 255, 0x4A / 255)
TEAL = Color(0x0D / 255, 0x94 / 255, 0x88 / 255)
TEAL_LIGHT = Color(0x14 / 255, 0xB8 / 255, 0xA6 / 255)
CORAL = Color(0xF0 / 255, 0x73 / 255, 0x4A / 255)
GOLD = Color(0xF5 / 255, 0xB8 / 255, 0x42 / 255)
SLATE = Color(0x3D / 255, 0x4F / 255, 0x60 / 255)
MUTED = Color(0x6B / 255, 0x7C / 255, 0x8C / 255)
OFF = Color(0xF4 / 255, 0xF7 / 255, 0xF9 / 255)
LINE = Color(0xE2 / 255, 0xE8 / 255, 0xED / 255)

W, H = A4  # 595.27 x 841.89


def round_rect(c, x, y, w, h, r, fill=None, stroke=None, sw=0.6):
    c.saveState()
    if fill:
        c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.setLineWidth(sw)
    p = c.beginPath()
    p.moveTo(x + r, y)
    p.lineTo(x + w - r, y)
    p.arcTo(x + w - 2 * r, y, x + w, y + 2 * r, -90, 90)
    p.lineTo(x + w, y + h - r)
    p.arcTo(x + w - 2 * r, y + h - 2 * r, x + w, y + h, 0, 90)
    p.lineTo(x + r, y + h)
    p.arcTo(x, y + h - 2 * r, x + 2 * r, y + h, 90, 90)
    p.lineTo(x, y + r)
    p.arcTo(x, y, x + 2 * r, y + 2 * r, 180, 90)
    p.close()
    if fill and stroke:
        c.drawPath(p, fill=1, stroke=1)
    elif fill:
        c.drawPath(p, fill=1, stroke=0)
    else:
        c.drawPath(p, fill=0, stroke=1)
    c.restoreState()


def wrapped(c, text, x, y, max_w, font="Helvetica", size=9, leading=11.5, color=SLATE, align="left"):
    c.setFont(font, size)
    c.setFillColor(color)
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if c.stringWidth(trial, font, size) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    for i, line in enumerate(lines):
        yy = y - i * leading
        if align == "center":
            c.drawCentredString(x, yy, line)
        else:
            c.drawString(x, yy, line)
    return len(lines) * leading


def build(path):
    c = canvas.Canvas(path, pagesize=A4)
    m = 12 * mm

    # ── Hero band ──
    c.setFillColor(NAVY)
    c.rect(0, H - 68 * mm, W, 68 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.rect(0, 0, 3.2 * mm, H, fill=1, stroke=0)
    # bottom strip of hero
    c.setFillColor(NAVY_MID)
    c.rect(0, H - 68 * mm, W, 10 * mm, fill=1, stroke=0)

    c.setFillColor(TEAL_LIGHT)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(m, H - 12 * mm, "AI-FIRST RECRUITMENT  ·  WHATSAPP AT THE CORE")

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 28)
    c.drawString(m, H - 26 * mm, "HarmiRecruit")

    c.setFont("Helvetica", 13)
    c.setFillColor(TEAL_LIGHT)
    c.drawString(m, H - 35 * mm, "What every seat on your team gets")

    c.setFillColor(Color(0.77, 0.83, 0.87))
    wrapped(
        c,
        "Built for Indian agencies, staffing companies, and hiring teams. "
        "Close candidates — not spreadsheets.",
        m,
        H - 44 * mm,
        W - 2 * m,
        size=10,
        leading=13,
        color=Color(0.77, 0.83, 0.87),
    )

    # Role chips in hero footer
    chips = [
        ("Recruiters", TEAL),
        ("Hiring Managers", CORAL),
        ("Owners / Admins", GOLD),
        ("Candidates", TEAL_LIGHT),
    ]
    cx = m
    for label, col in chips:
        tw = c.stringWidth(label, "Helvetica-Bold", 8) + 14
        round_rect(c, cx, H - 65.5 * mm, tw, 5.5 * mm, 2.5 * mm, fill=col)
        c.setFillColor(NAVY if col == GOLD else white)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(cx + 7, H - 63.5 * mm, label)
        cx += tw + 4 * mm

    # ── Body background ──
    c.setFillColor(OFF)
    c.rect(0, 28 * mm, W, H - 68 * mm - 28 * mm, fill=1, stroke=0)

    # ── Four role cards (2x2) ──
    cards = [
        (
            "Recruiters",
            '"Close candidates, not data entry"',
            TEAL,
            [
                "AI resume parse in seconds + auto careers applications",
                "Kanban pipeline · multi-job submit · Match Score /10",
                "★ WhatsApp inbox (Meta API) + AI reply drafts",
                "Built-in video interviews · AI screening questions",
                "★ Follow-up engine: offer → Day 90, before they ghost",
            ],
        ),
        (
            "Hiring Managers",
            '"Your whole team\'s desk at a glance"',
            CORAL,
            [
                "Team pipeline, workload & today's interviews",
                "My candidates ↔ Team view toggle",
                "AI Job Description generator (IT, BPO, banking…)",
                "Review scorecards before client shortlist",
                "Per-recruiter performance: submits → joins",
            ],
        ),
        (
            "Owners / Admins",
            '"Run the business, not the spreadsheet"',
            GOLD,
            [
                "Org KPIs, funnel, leaderboard, live activity",
                "Clients + geo-match · branded careers page",
                "Reports & analytics — export CSV/Excel",
                "Logo, colours, WhatsApp signatures",
                "Razorpay billing (UPI/cards) · GST · private data",
            ],
        ),
        (
            "Candidates",
            '"Zero friction. No app to install."',
            TEAL_LIGHT,
            [
                "Apply on phone: name, number, resume — done",
                "Instant application confirmation email",
                "Interview invite on WhatsApp + calendar file",
                "One-tap browser video join · mic check included",
                "No downloads. No friction. Higher show rates.",
            ],
        ),
    ]

    gap = 4 * mm
    card_w = (W - 2 * m - gap) / 2
    card_h = 58 * mm
    top_y = H - 74 * mm

    for i, (title, quote, accent, bullets) in enumerate(cards):
        col, row = i % 2, i // 2
        x = m + col * (card_w + gap)
        y = top_y - (row + 1) * card_h - row * gap

        round_rect(c, x, y, card_w, card_h, 3 * mm, fill=white, stroke=LINE, sw=0.8)
        c.setFillColor(accent)
        c.rect(x, y, 2.2 * mm, card_h, fill=1, stroke=0)

        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(x + 5 * mm, y + card_h - 7 * mm, title.upper())

        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 9.5)
        # quote may be long — wrap lightly
        wrapped(c, quote, x + 5 * mm, y + card_h - 14 * mm, card_w - 9 * mm, font="Helvetica-Bold", size=9.5, leading=11.5, color=NAVY)

        by = y + card_h - 28 * mm
        for b in bullets:
            c.setFillColor(TEAL if accent != GOLD else CORAL)
            c.circle(x + 6.2 * mm, by + 2.2, 1.3, fill=1, stroke=0)
            wrapped(c, b, x + 9 * mm, by, card_w - 13 * mm, size=8, leading=10, color=SLATE)
            by -= 7.2 * mm

    # ── AI strip ──
    ai_y = 34 * mm
    round_rect(c, m, ai_y, W - 2 * m, 22 * mm, 2.5 * mm, fill=NAVY)
    c.setFillColor(TEAL_LIGHT)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(m + 4 * mm, ai_y + 16 * mm, "THE AI LAYER — WORKS FOR EVERY ROLE")

    ai_items = [
        "Resume Parser",
        "Match Score",
        "JD Generator",
        "Screening Qs",
        "WA Replies",
        "Follow-up Scripts",
    ]
    ax = m + 4 * mm
    for item in ai_items:
        tw = c.stringWidth(item, "Helvetica-Bold", 7.5) + 12
        round_rect(c, ax, ai_y + 4.5 * mm, tw, 7 * mm, 2 * mm, fill=TEAL)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(ax + 6, ai_y + 6.8 * mm, item)
        ax += tw + 2.5 * mm

    # ── Footer CTA ──
    c.setFillColor(NAVY)
    c.rect(0, 0, W, 28 * mm, fill=1, stroke=0)
    c.setFillColor(NAVY_MID)
    c.rect(0, 22 * mm, W, 6 * mm, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(m, 11 * mm, "Hire faster. Ghost less. Spreadsheet zero.")

    c.setFillColor(Color(0.77, 0.83, 0.87))
    c.setFont("Helvetica", 8)
    c.drawString(m, 5 * mm, "HarmiRecruit  ·  Book a demo")

    # CTA pill
    cta = "Book a demo →"
    ctw = c.stringWidth(cta, "Helvetica-Bold", 10) + 22
    round_rect(c, W - m - ctw, 6 * mm, ctw, 12 * mm, 3.5 * mm, fill=TEAL)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(W - m - ctw + 11, 10 * mm, cta)

    c.save()
    print(path)


if __name__ == "__main__":
    build("/Users/jyotiranjan/workarea/projects/AIOS_Recruitment/docs/HarmiRecruit_Sales_Flyer.pdf")
