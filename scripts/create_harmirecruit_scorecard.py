#!/usr/bin/env python3
"""HarmiRecruit AI Hiring Readiness Scorecard + discovery talk tracks (A4 PDF)."""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color, white

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
LIGHT_TEAL = Color(0xE6 / 255, 0xF6 / 255, 0xF4 / 255)

W, H = A4

QUESTIONS = [
    (
        "Data hygiene",
        "Where do candidate resumes and profiles live today?",
        "Scattered (drives/WhatsApp/email)",
        "One searchable system",
        "AI Resume Parser + Careers apply",
    ),
    (
        "Channel discipline",
        "Where do recruiter–candidate chats happen?",
        "Personal WhatsApp / mixed",
        "Org inbox, auditable",
        "WhatsApp inbox (Meta API)",
    ),
    (
        "Screening consistency",
        "How are candidates shortlisted for a role?",
        "Gut feel / keyword scan",
        "Structured score vs JD",
        "AI Match Score /10",
    ),
    (
        "HM collaboration",
        "How do hiring managers see pipeline status?",
        "Chase recruiters / status calls",
        "Live shared pipeline",
        "HM dashboard + scorecards",
    ),
    (
        "Follow-up ownership",
        "Who owns candidate nurturing from offer → Day 90?",
        "Ad-hoc / often drops",
        "Milestones + ownership",
        "Follow-up engine + AI scripts",
    ),
    (
        "AI trust",
        "Would your team use AI drafts if every suggestion is editable?",
        "Low trust / blocked",
        "Human-in-the-loop OK",
        "WA replies · JD · screening Qs",
    ),
    (
        "Measurement",
        "Do you track source → submit → interview → select → join?",
        "Partial / anecdotal",
        "Funnel + recruiter KPIs",
        "Analytics + leaderboard",
    ),
    (
        "Scale pressure",
        "Can current headcount absorb next quarter’s hiring volume?",
        "No — burnout / backlog",
        "Yes — with better tools",
        "AI layer across every seat",
    ),
]

PERSONAS = [
    (
        "Owner / Agency Head",
        GOLD,
        "Outcome: more joins with the same team — prove margin, not features.",
        [
            "Open: “If hiring volume rises 30%, do you hire more recruiters — or make each closer?”",
            "Probe: cost per join, ghosting before DOJ, hours lost to resume dump + WhatsApp chase.",
            "Bridge: “HarmiRecruit is the closer layer — parse, match, WhatsApp, Day-90 follow-up.”",
            "ROI ask: hrs/recruiter/week on admin × cost; join-rate lift × contribution per join.",
            "Close: 30-day pilot on 1 desk / 1 job family; KPIs = time-to-shortlist, response SLA, joins.",
        ],
    ),
    (
        "CHRO / VP HR",
        TEAL,
        "Outcome: consistent quality of hire, process fairness, manager experience.",
        [
            "Open: “Where does quality of hire break — sourcing, screening, or offer-to-join?”",
            "Probe: scorecard consistency, bias risk, HM satisfaction, offer drop-off.",
            "Bridge: “Structured Match Score + editable AI drafts = speed without black-box decisions.”",
            "ROI ask: fewer wasted interviews; higher accept/join; less replacement cost.",
            "Close: pilot with one business unit; review bias/override controls with you before scale.",
        ],
    ),
    (
        "HRBP",
        CORAL,
        "Outcome: less firefighting between HMs and recruiters — visibility without chasing.",
        [
            "Open: “What do HMs ping you for every week that a live pipeline should answer?”",
            "Probe: req chaos, interview no-shows, unclear ownership after verbal offer.",
            "Bridge: “HM dashboard + WhatsApp invites + follow-ups cut the status theatre.”",
            "ROI ask: HM wait time, no-show rate, days from shortlist → interview.",
            "Close: run discovery with one frustrated HM present — let them score Q4 & Q5 live.",
        ],
    ),
    (
        "CTO / IT",
        NAVY_MID,
        "Outcome: safe AI adoption — data control, integrations, WhatsApp compliance.",
        [
            "Open: “What’s blocking AI in hiring today — security, data residency, or shadow tools?”",
            "Probe: Meta WhatsApp API, resume storage, SSO/roles, export, audit trail.",
            "Bridge: “AI assists; humans send. Org WhatsApp + role-scoped data beats personal chats.”",
            "ROI ask: reduce shadow WhatsApp/risk; one system vs brittle spreadsheet + tools sprawl.",
            "Close: share security one-pager + sandbox tenant; IT reviews before CHRO rollout.",
        ],
    ),
]


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


def wrapped(c, text, x, y, max_w, font="Helvetica", size=9, leading=11.5, color=SLATE):
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
        c.drawString(x, y - i * leading, line)
    return len(lines) * leading


def score_circles(c, x, y, n=5, r=3.2):
    for i in range(n):
        cx = x + i * (r * 2 + 3.2)
        c.setStrokeColor(LINE)
        c.setLineWidth(0.8)
        c.setFillColor(white)
        c.circle(cx, y, r, fill=1, stroke=1)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 6)
        c.drawCentredString(cx, y - 2, str(i + 1))


def page_scorecard(c):
    m = 11 * mm

    # Hero
    c.setFillColor(NAVY)
    c.rect(0, H - 42 * mm, W, 42 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.rect(0, 0, 3 * mm, H, fill=1, stroke=0)
    c.setFillColor(NAVY_MID)
    c.rect(0, H - 42 * mm, W, 7 * mm, fill=1, stroke=0)

    c.setFillColor(TEAL_LIGHT)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(m, H - 10 * mm, "DISCOVERY CALL TOOL  ·  USE ON EVERY FIRST MEETING")

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(m, H - 22 * mm, "AI Hiring Readiness Scorecard")

    c.setFillColor(TEAL_LIGHT)
    c.setFont("Helvetica", 10)
    c.drawString(m, H - 30 * mm, "HarmiRecruit  ·  Score 8 parameters  ·  Map gaps to ROI  ·  Demo only what closes the gap")

    # Meta fields
    c.setFillColor(OFF)
    c.rect(0, H - 58 * mm, W, 16 * mm, fill=1, stroke=0)
    fields = [
        (m, "Company"),
        (m + 55 * mm, "Persona"),
        (m + 105 * mm, "Date"),
        (m + 145 * mm, "Scorer"),
    ]
    for x, label in fields:
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x, H - 47 * mm, label.upper())
        c.setStrokeColor(LINE)
        c.setLineWidth(0.7)
        c.line(x, H - 54 * mm, x + 48 * mm if label != "Scorer" else x + 42 * mm, H - 54 * mm)

    # Instructions strip
    c.setFillColor(LIGHT_TEAL)
    c.rect(m, H - 68 * mm, W - 2 * m, 8 * mm, fill=1, stroke=0)
    wrapped(
        c,
        "Score each 1–5 (1 = painful / manual, 5 = ready / disciplined). Total /40 → tier below. Circle score live; note the gap in ‘Module’ column.",
        m + 3 * mm,
        H - 63.5 * mm,
        W - 2 * m - 6 * mm,
        size=7.5,
        leading=9,
        color=NAVY,
    )

    # Column headers
    header_y = H - 75 * mm
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(m, header_y, "#")
    c.drawString(m + 7 * mm, header_y, "PARAMETER / QUESTION")
    c.drawString(m + 118 * mm, header_y, "SCORE")
    c.drawString(m + 145 * mm, header_y, "HARMIRECRUIT MODULE")
    c.setStrokeColor(TEAL)
    c.setLineWidth(1)
    c.line(m, header_y - 2 * mm, W - m, header_y - 2 * mm)

    # Questions
    row_h = 18.5 * mm
    y0 = header_y - 4 * mm
    for i, (param, q, low, high, module) in enumerate(QUESTIONS):
        y = y0 - (i + 1) * row_h
        if i % 2 == 0:
            c.setFillColor(Color(0.97, 0.98, 0.99))
            c.rect(m - 1 * mm, y, W - 2 * m + 2 * mm, row_h, fill=1, stroke=0)

        c.setFillColor(TEAL)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(m, y + row_h - 6 * mm, f"{i + 1:02d}")

        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(m + 7 * mm, y + row_h - 6 * mm, param)

        wrapped(c, q, m + 7 * mm, y + row_h - 11.5 * mm, 105 * mm, size=7.5, leading=9, color=SLATE)

        c.setFillColor(MUTED)
        c.setFont("Helvetica", 6.5)
        c.drawString(m + 7 * mm, y + 3.2 * mm, f"1 = {low}   →   5 = {high}")

        score_circles(c, m + 118 * mm + 4, y + row_h / 2 - 1)

        c.setFillColor(TEAL)
        c.setFont("Helvetica-Bold", 7)
        # module may wrap
        wrapped(c, module, m + 145 * mm, y + row_h / 2 + 2, 42 * mm, font="Helvetica-Bold", size=7, leading=8.5, color=TEAL)

    # Tier + total box
    box_y = 28 * mm
    box_h = 36 * mm
    round_rect(c, m, box_y, W - 2 * m, box_h, 2.5 * mm, fill=NAVY)

    c.setFillColor(TEAL_LIGHT)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(m + 4 * mm, box_y + box_h - 7 * mm, "TOTAL SCORE  / 40")

    # Score blanks
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(m + 4 * mm, box_y + box_h - 18 * mm, "____")

    tiers = [
        ("8–18", "Manual", "Spreadsheet + personal WhatsApp", CORAL),
        ("19–28", "Tool-ready", "Have process; AI still optional", GOLD),
        ("29–40", "AI-ambitious", "Ready for governed AI scale", TEAL_LIGHT),
    ]
    tx = m + 38 * mm
    for score, name, blurb, col in tiers:
        round_rect(c, tx, box_y + 6 * mm, 50 * mm, 24 * mm, 2 * mm, fill=NAVY_MID)
        c.setFillColor(col)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(tx + 3 * mm, box_y + 22 * mm, f"{score}  ·  {name}")
        wrapped(c, blurb, tx + 3 * mm, box_y + 15 * mm, 44 * mm, size=7, leading=8.5, color=Color(0.78, 0.85, 0.90))
        tx += 53 * mm

    # Footer CTA
    c.setFillColor(OFF)
    c.rect(0, 0, W, 26 * mm, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(m, 16 * mm, "Next: pick the 3 lowest scores → demo only those modules → fill ROI with their numbers.")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(
        m,
        8 * mm,
        "ROI sketch: (hrs saved/week × cost/hr × 48) + (extra joins × value/join) + (wasted interviews avoided × cost).",
    )
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(W - m, 12 * mm, "Page 1  ·  Scorecard")


def page_talk_tracks(c):
    m = 11 * mm

    c.setFillColor(NAVY)
    c.rect(0, H - 36 * mm, W, 36 * mm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.rect(0, 0, 3 * mm, H, fill=1, stroke=0)

    c.setFillColor(TEAL_LIGHT)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(m, H - 10 * mm, "SALES ENABLEMENT  ·  INTERNAL — DO NOT HAND TO PROSPECT")

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(m, H - 22 * mm, "Persona Talk Tracks")

    c.setFillColor(Color(0.77, 0.83, 0.87))
    c.setFont("Helvetica", 10)
    c.drawString(m, H - 30 * mm, "Owner  ·  CHRO / VP HR  ·  HRBP  ·  CTO / IT — match the room, then run the scorecard.")

    # Call flow strip
    flow_y = H - 48 * mm
    round_rect(c, m, flow_y, W - 2 * m, 10 * mm, 2 * mm, fill=LIGHT_TEAL)
    wrapped(
        c,
        "Call flow: 2-min pain → scorecard live (5 min) → name tier + 3 gaps → demo those modules → leave ROI sketch → propose 30-day pilot.",
        m + 3 * mm,
        flow_y + 3.5 * mm,
        W - 2 * m - 6 * mm,
        size=7.5,
        leading=9,
        color=NAVY,
    )

    gap = 3.5 * mm
    card_w = (W - 2 * m - gap) / 2
    card_h = 58 * mm
    top = flow_y - 4 * mm

    for i, (title, accent, outcome, bullets) in enumerate(PERSONAS):
        col, row = i % 2, i // 2
        x = m + col * (card_w + gap)
        y = top - (row + 1) * card_h - row * gap

        round_rect(c, x, y, card_w, card_h, 2.5 * mm, fill=white, stroke=LINE, sw=0.8)
        c.setFillColor(accent)
        c.rect(x, y, 2.2 * mm, card_h, fill=1, stroke=0)

        c.setFillColor(accent if accent != NAVY_MID else TEAL)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x + 5 * mm, y + card_h - 8 * mm, title)

        wrapped(c, outcome, x + 5 * mm, y + card_h - 15 * mm, card_w - 9 * mm, font="Helvetica-Oblique", size=7.5, leading=9.5, color=MUTED)

        by = y + card_h - 28 * mm
        for b in bullets:
            c.setFillColor(TEAL if accent != GOLD else CORAL)
            c.circle(x + 6 * mm, by + 2, 1.2, fill=1, stroke=0)
            h = wrapped(c, b, x + 9 * mm, by, card_w - 13 * mm, size=7.2, leading=9, color=SLATE)
            by -= max(h, 9) + 2.2

    # Objection + ROI footer
    foot_y = 8 * mm
    round_rect(c, m, foot_y, W - 2 * m, 22 * mm, 2 * mm, fill=NAVY)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(m + 4 * mm, foot_y + 15 * mm, "FAST OBJECTIONS")
    c.setFillColor(Color(0.85, 0.90, 0.93))
    c.setFont("Helvetica", 7)
    wrapped(
        c,
        "“We have an ATS” → ATS stores; HarmiRecruit closes (WhatsApp + AI + follow-up).  "
        "“AI is risky” → every draft editable; humans send.  "
        "“Team won’t change” → start with resume parse + Match Score (day-one win).  "
        "“Not now” → leave scorecard; book review when Q7–Q8 pressure spikes.",
        m + 4 * mm,
        foot_y + 9 * mm,
        W - 2 * m - 8 * mm,
        size=7,
        leading=8.5,
        color=Color(0.85, 0.90, 0.93),
    )

    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(W - m, 3.5 * mm, "Page 2  ·  Talk tracks")


def build(path):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle("HarmiRecruit — AI Hiring Readiness Scorecard")
    c.setAuthor("HarmiRecruit")
    page_scorecard(c)
    c.showPage()
    page_talk_tracks(c)
    c.save()
    print(path)


if __name__ == "__main__":
    build("/Users/jyotiranjan/workarea/projects/AIOS_Recruitment/docs/HarmiRecruit_AI_Hiring_Readiness_Scorecard.pdf")
