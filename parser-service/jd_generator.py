"""Template-based job description generator.

No LLM involved: the title is matched against role families and seniority
keywords, then a JD is assembled from curated building blocks. Output format
mirrors what the Anthropic path produced — plain text with a role summary,
"Key Responsibilities" / "Requirements" / "What We Offer" sections and
"- " bullets — so the client UI needs no changes.
"""

from __future__ import annotations

import re
from typing import Optional

# ── Role families ────────────────────────────────────────────────────
# Each family: detection keywords, responsibilities, requirements, and
# optionally:
#   experience — overrides the seniority-based experience line
#   extras     — list of (heading, bullets) sections rendered after
#                Requirements (shift timings, languages, eligibility, ...)
# The first matching family (checked in order) wins; GENERIC is the fallback.
# High-volume roles (telecaller, field sales, delivery, ...) come first so
# their specific keywords win over broader families like "sales" or "support".

ROLE_FAMILIES: list[dict] = [
    {
        "name": "telecaller",
        "keywords": [
            "tele caller", "telecaller", "tele-caller", "telecalling", "tele calling",
            "telesales", "tele sales", "telemarketing", "call center", "call centre",
            "voice process", "customer care", "outbound calling", "inbound calling",
        ],
        "summary": "connecting with customers over the phone and turning conversations into outcomes",
        "experience": "0–2 years (freshers with good communication skills are welcome)",
        "responsibilities": [
            "Make outbound calls to prospective customers from the provided database and explain products/services clearly",
            "Handle inbound queries, resolve basic concerns, and route complex issues to the right team",
            "Follow the calling script while handling objections politely and persuasively",
            "Maintain accurate call records, update customer details in the CRM, and schedule follow-up calls",
            "Meet daily and weekly targets for calls made, leads generated, and conversions",
        ],
        "requirements": [
            "Clear, confident speaking voice with active listening skills",
            "Persuasion and objection-handling ability with a target-driven attitude",
            "Basic computer skills — CRM entry, Excel/Google Sheets",
            "Minimum qualification: 12th pass; graduates preferred",
        ],
        "extras": [
            ("Shift Timings", [
                "Day shift: 9:30 AM – 6:30 PM, 6 days a week (weekly off as per roster)",
                "Exact shift and roster will be confirmed during the interview",
            ]),
            ("Languages", [
                "Fluency in Hindi and working knowledge of English required",
                "Knowledge of regional languages is an added advantage",
            ]),
            ("Eligibility", [
                "Age: 18–30 years preferred",
                "Comfortable working from office with a headset and calling systems",
            ]),
        ],
    },
    {
        "name": "field_sales",
        "keywords": ["field sales", "field executive", "sales executive", "direct sales", "field officer", "relationship officer"],
        "summary": "meeting customers face to face and driving sales on the ground",
        "experience": "0–3 years",
        "responsibilities": [
            "Visit prospective customers in the assigned territory to pitch products/services",
            "Generate leads through field visits, references, and local networking",
            "Achieve monthly sales targets and report daily activity to the manager",
            "Collect documents, complete onboarding formalities, and ensure smooth handover",
            "Build lasting relationships to drive repeat business and referrals",
        ],
        "requirements": [
            "Comfortable with extensive local travel; own two-wheeler and valid driving licence preferred",
            "Strong convincing skills and a self-driven, target-oriented attitude",
            "Basic smartphone proficiency for reporting apps",
            "Minimum qualification: 12th pass; graduates preferred",
        ],
        "extras": [
            ("Shift Timings", [
                "Field role: typically 9:30 AM – 6:30 PM, 6 days a week",
            ]),
            ("Languages", [
                "Fluency in the local language and Hindi; basic English is a plus",
            ]),
            ("Eligibility", [
                "Age: 18–35 years preferred",
                "Incentives are paid over and above fixed salary based on target achievement",
            ]),
        ],
    },
    {
        "name": "delivery",
        "keywords": ["delivery executive", "delivery boy", "delivery partner", "rider", "courier", "delivery associate"],
        "summary": "delivering orders safely, on time, and with a smile",
        "experience": "0–2 years (freshers welcome)",
        "responsibilities": [
            "Pick up and deliver orders within the assigned area on time",
            "Verify orders, collect payments/OTP confirmations where applicable",
            "Maintain delivery records in the partner app and follow route plans",
            "Handle packages with care and follow safety and traffic rules",
            "Coordinate with the hub team for returns and escalations",
        ],
        "requirements": [
            "Own two-wheeler with valid driving licence and vehicle documents",
            "Android smartphone for the delivery app",
            "Familiarity with local routes and areas",
            "Minimum qualification: 10th pass",
        ],
        "extras": [
            ("Shift Timings", [
                "Flexible/rotational shifts including weekends; choose slots as per availability",
            ]),
            ("Eligibility", [
                "Age: 18–40 years",
                "Earnings include per-delivery payout plus incentives and fuel allowance where applicable",
            ]),
        ],
    },
    {
        "name": "receptionist",
        "keywords": ["receptionist", "front desk", "front office", "office assistant", "office admin"],
        "summary": "being the welcoming face of the office and keeping the front desk running smoothly",
        "experience": "0–3 years",
        "responsibilities": [
            "Greet and assist visitors, clients, and candidates professionally",
            "Handle the front-desk phone line: answer, screen, and transfer calls",
            "Manage appointments, meeting rooms, courier, and office supplies",
            "Maintain visitor logs and support basic administrative tasks",
            "Coordinate with housekeeping, security, and vendors as needed",
        ],
        "requirements": [
            "Pleasant personality with excellent verbal communication",
            "Working knowledge of MS Office and email etiquette",
            "Well-organized, punctual, and presentable",
            "Minimum qualification: graduate preferred",
        ],
        "extras": [
            ("Shift Timings", [
                "Day shift: 9:00 AM – 6:00 PM, 6 days a week",
            ]),
            ("Languages", [
                "Fluent English and Hindi; local language is an advantage",
            ]),
            ("Eligibility", [
                "Age: 18–32 years preferred",
            ]),
        ],
    },
    {
        "name": "admissions_counselor",
        "keywords": [
            "admission counselor", "admissions counselor", "admission counsellor", "admissions counsellor",
            "admission officer", "admissions officer", "admission executive", "admissions executive",
            "admission coordinator", "admissions coordinator", "enrollment counselor", "enrolment counsellor",
            "academic counselor", "academic counsellor", "education counselor", "education counsellor",
            "student counselor", "student counsellor", "career counselor", "career counsellor",
            "study abroad counselor", "study abroad counsellor", "overseas education", "education consultant",
            "student advisor", "student adviser", "admission consultant", "admissions consultant",
        ],
        "summary": "guiding prospective students and parents through admissions, counseling, and enrollment",
        "experience": "0–4 years (freshers with strong communication skills are welcome)",
        "responsibilities": [
            "Counsel prospective students and parents on courses, eligibility, fees, and admission process",
            "Handle inbound and outbound enquiries via phone, walk-ins, email, and social channels",
            "Conduct follow-ups, schedule campus visits or counseling sessions, and convert leads to enrollments",
            "Collect and verify application documents and maintain accurate records in the CRM/ERP",
            "Coordinate with academics, finance, and operations teams to ensure smooth onboarding",
        ],
        "requirements": [
            "Excellent verbal communication and interpersonal skills",
            "Comfortable explaining academic programs, career outcomes, and admission requirements clearly",
            "Target-driven mindset with experience in counseling, inside sales, or customer-facing roles",
            "Basic computer skills — CRM entry, MS Office, and email follow-ups",
        ],
        "extras": [
            ("Shift Timings", [
                "Day shift: 9:30 AM – 6:30 PM, 6 days a week (may include weekend counseling drives)",
            ]),
            ("Languages", [
                "Fluency in English and Hindi required; regional language skills are an advantage",
            ]),
            ("Eligibility", [
                "Graduate preferred; candidates with prior education-sector experience will be preferred",
            ]),
        ],
    },
    {
        "name": "data_entry",
        "keywords": ["data entry", "back office", "computer operator", "mis executive", "typist"],
        "summary": "keeping business data accurate, complete, and up to date",
        "experience": "0–2 years (freshers welcome)",
        "responsibilities": [
            "Enter and update data accurately into company systems and spreadsheets",
            "Verify source documents and correct discrepancies before entry",
            "Maintain files, records, and daily MIS reports",
            "Meet daily productivity and accuracy targets",
            "Keep information confidential and follow data-handling guidelines",
        ],
        "requirements": [
            "Typing speed of 25–30+ WPM with high accuracy",
            "Good knowledge of MS Excel/Google Sheets and basic computer operations",
            "Attention to detail and ability to do repetitive work carefully",
            "Minimum qualification: 12th pass; graduates preferred",
        ],
        "extras": [
            ("Shift Timings", [
                "Day shift: 9:30 AM – 6:30 PM, 6 days a week",
            ]),
            ("Eligibility", [
                "Age: 18–35 years preferred",
            ]),
        ],
    },
    {
        "name": "security",
        "keywords": ["security guard", "security officer", "watchman", "security supervisor"],
        "summary": "keeping people, premises, and property safe around the clock",
        "experience": "0–5 years",
        "responsibilities": [
            "Monitor entry and exit of staff, visitors, vehicles, and materials",
            "Patrol the premises and report suspicious activity immediately",
            "Maintain registers for visitors, materials, and incidents",
            "Operate CCTV, access-control, and fire-safety equipment as trained",
            "Respond to emergencies and follow escalation procedures",
        ],
        "requirements": [
            "Physically fit with good observation skills",
            "Basic literacy for maintaining registers; security training/ex-serviceman preferred",
            "Disciplined, punctual, and honest",
            "Minimum qualification: 10th pass preferred",
        ],
        "extras": [
            ("Shift Timings", [
                "Rotational shifts (day/night), 8–12 hours as per site requirement",
            ]),
            ("Eligibility", [
                "Age: 21–45 years",
                "Minimum height and fitness criteria as per site norms",
            ]),
        ],
    },
    {
        "name": "banking_lending",
        "keywords": [
            "mortgage", "home loan", "housing loan", "loan manager", "loan officer",
            "relationship manager", "credit manager", "credit officer", "personal loan",
            "business loan", "lending", "banking", "nbfc", "microfinance",
            "collection officer", "recovery officer", "wealth manager",
        ],
        "summary": "helping customers access the right loan products while meeting business and compliance goals",
        "experience": "2–6 years in retail lending, mortgages, or banking sales",
        "responsibilities": [
            "Source and convert loan leads through branch walk-ins, referrals, DSAs, and partner channels",
            "Assess customer eligibility, explain loan products, and guide applicants through documentation",
            "Coordinate with credit, operations, and legal teams to process files and meet TAT targets",
            "Maintain accurate pipeline data in the LOS/CRM and follow up until disbursement",
            "Ensure adherence to KYC, AML, and internal policy guidelines on every file",
        ],
        "requirements": [
            "Hands-on experience in home loans, mortgages, personal loans, or retail banking sales",
            "Strong interpersonal skills with a target-driven approach to conversions",
            "Working knowledge of loan documentation, CIBIL checks, and basic underwriting criteria",
            "Comfort using CRM/LOS systems and MS Office for reporting",
        ],
    },
    {
        "name": "frontend",
        "keywords": ["frontend", "front-end", "front end", "javascript", "typescript", "react", "angular", "vue", "ui developer", "ui engineer", "web developer"],
        "summary": "building responsive, high-quality user interfaces and delightful web experiences",
        "responsibilities": [
            "Build and maintain responsive, accessible user interfaces using modern JavaScript frameworks",
            "Translate designs and wireframes into clean, reusable components",
            "Optimize applications for performance, cross-browser compatibility, and mobile devices",
            "Collaborate with designers, backend engineers, and product managers to ship features end to end",
            "Write unit and integration tests to keep the codebase reliable",
        ],
        "requirements": [
            "Strong proficiency in JavaScript/TypeScript, HTML, and CSS",
            "Hands-on experience with a modern frontend framework such as React, Angular, or Vue",
            "Familiarity with REST APIs, state management, and build tooling",
            "A good eye for detail, UX, and web performance",
        ],
    },
    {
        "name": "backend",
        "keywords": [
            "backend", "back-end", "back end", "api developer",
            "java developer", "java ", "j2ee", "spring boot", "spring developer", "hibernate",
            "python developer", "python ", "django", "flask",
            "node", "node.js", "nodejs",
            "golang developer", "go developer", "go ",
            "php developer", ".net developer", "c# developer",
            "ruby developer", "rails developer",
        ],
        "summary": "designing and building robust, scalable server-side systems and APIs",
        "responsibilities": [
            "Design, build, and maintain scalable APIs and backend services",
            "Model data and write efficient queries against relational and NoSQL databases",
            "Ensure reliability, security, and performance of production systems",
            "Collaborate with frontend engineers and product teams on feature delivery",
            "Participate in code reviews and contribute to engineering best practices",
        ],
        "requirements": [
            "Strong programming skills in one or more backend languages (e.g. Node.js, Python, Java, Go)",
            "Solid understanding of databases, caching, and API design",
            "Experience with version control, testing, and CI/CD workflows",
            "Ability to debug and optimize distributed systems",
        ],
    },
    {
        "name": "fullstack",
        "keywords": ["full stack", "full-stack", "fullstack", "software engineer", "software developer", "sde", "web engineer", "application developer"],
        "summary": "building features across the stack, from database to user interface",
        "responsibilities": [
            "Develop features end to end across frontend, backend, and database layers",
            "Design and consume RESTful APIs and integrate third-party services",
            "Write clean, well-tested, maintainable code and participate in code reviews",
            "Work closely with product and design to scope and deliver features",
            "Troubleshoot, debug, and improve existing applications",
        ],
        "requirements": [
            "Proficiency in at least one frontend and one backend technology",
            "Understanding of databases, API design, and web fundamentals",
            "Experience shipping and maintaining production software",
            "Strong problem-solving skills and ownership mindset",
        ],
    },
    {
        "name": "mobile",
        "keywords": ["android", "ios", "mobile", "flutter", "react native", "swift", "kotlin"],
        "summary": "building smooth, reliable mobile applications that users love",
        "responsibilities": [
            "Design, build, and ship high-quality mobile applications",
            "Integrate mobile apps with backend APIs and third-party SDKs",
            "Optimize app performance, battery usage, and startup time",
            "Monitor crashes and user feedback to continuously improve app quality",
            "Collaborate with design and backend teams on feature delivery",
        ],
        "requirements": [
            "Hands-on experience with native (Swift/Kotlin) or cross-platform (Flutter/React Native) development",
            "Familiarity with mobile release processes on the App Store / Play Store",
            "Understanding of REST APIs, offline storage, and push notifications",
            "Attention to detail on UI polish and platform conventions",
        ],
    },
    {
        "name": "devops",
        "keywords": ["devops", "sre", "site reliability", "platform engineer", "cloud engineer", "infrastructure"],
        "summary": "keeping infrastructure reliable, automated, and scalable",
        "responsibilities": [
            "Build and maintain CI/CD pipelines and deployment automation",
            "Manage cloud infrastructure using infrastructure-as-code tools",
            "Monitor systems, respond to incidents, and drive down MTTR",
            "Improve reliability, observability, and cost efficiency of the platform",
            "Partner with development teams on release and operational best practices",
        ],
        "requirements": [
            "Experience with at least one major cloud provider (AWS, Azure, or GCP)",
            "Proficiency with containers and orchestration (Docker, Kubernetes)",
            "Familiarity with IaC tools such as Terraform or Ansible",
            "Scripting skills (Bash, Python) and a strong automation mindset",
        ],
    },
    {
        "name": "data",
        "keywords": ["data scientist", "data analyst", "data engineer", "machine learning", "ml engineer", "ai engineer", "analytics", "business intelligence", "bi "],
        "summary": "turning data into insights and intelligent products",
        "responsibilities": [
            "Collect, clean, and analyze data to answer business-critical questions",
            "Build and maintain data pipelines, models, or dashboards",
            "Present findings and recommendations to stakeholders in a clear, actionable way",
            "Collaborate with engineering and product teams to productionize data solutions",
            "Ensure data quality, governance, and documentation",
        ],
        "requirements": [
            "Strong SQL skills and proficiency in Python or R",
            "Experience with data visualization or ML tooling relevant to the role",
            "Solid grounding in statistics and analytical problem solving",
            "Ability to communicate technical results to non-technical audiences",
        ],
    },
    {
        "name": "qa",
        "keywords": ["qa", "quality assurance", "test engineer", "sdet", "automation engineer", "tester"],
        "summary": "safeguarding product quality through rigorous testing and automation",
        "responsibilities": [
            "Design, write, and execute manual and automated test cases",
            "Build and maintain test automation frameworks and CI integrations",
            "Identify, document, and track defects through to resolution",
            "Work with developers to reproduce issues and verify fixes",
            "Champion quality practices across the development lifecycle",
        ],
        "requirements": [
            "Experience in functional, regression, and API testing",
            "Hands-on skills with automation tools such as Selenium, Cypress, or Playwright",
            "Understanding of QA processes, bug tracking, and test planning",
            "A meticulous, detail-oriented approach to breaking software",
        ],
    },
    {
        "name": "design",
        "keywords": ["designer", "ux", "ui/ux", "product design", "graphic design", "visual design"],
        "summary": "crafting intuitive, beautiful experiences that solve real user problems",
        "responsibilities": [
            "Design user flows, wireframes, prototypes, and high-fidelity mockups",
            "Conduct user research and usability testing to validate design decisions",
            "Maintain and evolve the design system for consistency across products",
            "Collaborate with product managers and engineers from concept to launch",
            "Iterate on designs based on data, feedback, and business goals",
        ],
        "requirements": [
            "A strong portfolio demonstrating product or visual design work",
            "Proficiency with design tools such as Figma, Sketch, or Adobe XD",
            "Understanding of user-centered design principles and accessibility",
            "Excellent communication and stakeholder-management skills",
        ],
    },
    {
        "name": "product",
        "keywords": ["product manager", "product owner", "program manager", "project manager", "scrum master", "delivery manager"],
        "summary": "driving product strategy and delivery from idea to launch",
        "responsibilities": [
            "Define product roadmaps and prioritize features based on impact and effort",
            "Gather requirements from stakeholders and translate them into clear specifications",
            "Coordinate cross-functional teams to deliver on time and within scope",
            "Track KPIs and use data to inform product decisions",
            "Communicate progress, risks, and trade-offs to leadership",
        ],
        "requirements": [
            "Proven experience managing products or projects end to end",
            "Strong analytical skills and comfort with data-driven decision making",
            "Excellent written and verbal communication",
            "Familiarity with agile methodologies and modern product tooling",
        ],
    },
    {
        "name": "sales",
        "keywords": ["sales", "business development", "account executive", "account manager", "bdm", "bde", "inside sales"],
        "summary": "driving revenue growth by building lasting client relationships",
        "responsibilities": [
            "Identify, qualify, and pursue new business opportunities",
            "Manage the full sales cycle from prospecting to closing",
            "Build and nurture long-term relationships with clients and partners",
            "Meet or exceed quarterly revenue targets",
            "Maintain accurate pipeline data in the CRM and report on forecasts",
        ],
        "requirements": [
            "Demonstrated success in a sales or business development role",
            "Excellent negotiation, presentation, and relationship-building skills",
            "Self-motivated with a target-driven mindset",
            "Familiarity with CRM tools such as Salesforce or HubSpot",
        ],
    },
    {
        "name": "marketing",
        "keywords": ["marketing", "seo", "content writer", "social media", "brand", "growth", "digital marketing"],
        "summary": "growing brand awareness and demand through creative, data-driven campaigns",
        "responsibilities": [
            "Plan and execute marketing campaigns across digital and offline channels",
            "Create compelling content for web, email, and social media",
            "Analyze campaign performance and optimize for engagement and conversion",
            "Manage SEO/SEM efforts to grow organic and paid traffic",
            "Collaborate with sales and product teams on positioning and messaging",
        ],
        "requirements": [
            "Hands-on experience running marketing campaigns with measurable results",
            "Strong copywriting and content-creation skills",
            "Familiarity with analytics tools such as Google Analytics",
            "Creative thinking paired with a data-driven approach",
        ],
    },
    {
        "name": "hr",
        "keywords": ["hr", "human resources", "recruiter", "talent acquisition", "people operations", "recruitment"],
        "summary": "attracting, developing, and retaining great people",
        "responsibilities": [
            "Manage end-to-end recruitment: sourcing, screening, interviewing, and offers",
            "Partner with hiring managers to define role requirements and hiring plans",
            "Drive onboarding, engagement, and retention initiatives",
            "Maintain HR records, policies, and compliance requirements",
            "Support performance management and employee-relations processes",
        ],
        "requirements": [
            "Experience in recruitment or a generalist HR role",
            "Strong interpersonal and communication skills",
            "Working knowledge of HR systems and applicant tracking tools",
            "Discretion and sound judgment when handling sensitive matters",
        ],
    },
    {
        "name": "finance",
        "keywords": ["accountant", "finance", "financial analyst", "accounts", "payroll", "auditor", "bookkeeper"],
        "summary": "keeping the numbers accurate and the business financially healthy",
        "responsibilities": [
            "Prepare and maintain accurate financial records, reports, and reconciliations",
            "Support budgeting, forecasting, and variance analysis",
            "Ensure compliance with accounting standards and tax regulations",
            "Process invoices, payments, and payroll accurately and on time",
            "Assist with audits and month-end / year-end close activities",
        ],
        "requirements": [
            "Degree in accounting, finance, or a related field",
            "Proficiency with accounting software and advanced Excel",
            "Strong attention to detail and numerical accuracy",
            "Knowledge of applicable statutory and tax requirements",
        ],
    },
    {
        "name": "support",
        "keywords": ["customer support", "customer success", "support engineer", "helpdesk", "service desk", "technical support"],
        "summary": "delighting customers by resolving their problems quickly and empathetically",
        "responsibilities": [
            "Respond to customer queries via email, chat, and phone within SLA",
            "Troubleshoot issues, escalate when needed, and follow through to resolution",
            "Document solutions and contribute to the knowledge base",
            "Gather customer feedback and share insights with product teams",
            "Maintain high customer-satisfaction scores",
        ],
        "requirements": [
            "Excellent communication skills and a customer-first attitude",
            "Ability to troubleshoot methodically and explain solutions simply",
            "Experience with ticketing systems such as Zendesk or Freshdesk",
            "Patience and composure under pressure",
        ],
    },
    {
        "name": "operations",
        "keywords": ["operations", "logistics", "supply chain", "warehouse", "procurement", "admin"],
        "summary": "keeping day-to-day operations running smoothly and efficiently",
        "responsibilities": [
            "Oversee daily operational processes and ensure smooth execution",
            "Identify bottlenecks and drive process improvements",
            "Coordinate with vendors, partners, and internal teams",
            "Track operational metrics and report on performance",
            "Ensure compliance with company policies and safety standards",
        ],
        "requirements": [
            "Experience in an operations, logistics, or administrative role",
            "Strong organizational and multitasking abilities",
            "Proficiency with spreadsheets and operational tooling",
            "A proactive, problem-solving attitude",
        ],
    },
]

GENERIC_FAMILY = {
    "name": "generic",
    "summary": "contributing to the team's goals with skill, ownership, and professionalism",
    "responsibilities": [
        "Own and deliver day-to-day responsibilities of the role to a high standard",
        "Collaborate with team members and stakeholders across departments",
        "Identify opportunities for improvement and contribute ideas proactively",
        "Track and report progress against agreed goals",
        "Uphold company values, processes, and quality standards",
    ],
    "requirements": [
        "Relevant experience or demonstrable aptitude for the role",
        "Strong communication and collaboration skills",
        "Ability to manage time and priorities independently",
        "A proactive, growth-oriented mindset",
    ],
}

# ── Seniority ────────────────────────────────────────────────────────

SENIORITY_LEVELS = [
    ("intern", ["intern", "trainee", "apprentice"], None,
     "This is an entry-level opportunity — enthusiasm and willingness to learn matter more than experience."),
    ("junior", ["junior", "jr.", "jr ", "associate", "fresher", "entry level", "entry-level"], "0–2 years",
     None),
    ("lead", ["lead", "principal", "staff", "architect"], "7+ years",
     "You will set technical direction, mentor the team, and own outcomes end to end."),
    ("manager", ["manager", "head of", "director", "vp ", "vice president", "chief"], "8+ years",
     "You will lead and grow a team, own strategy for your area, and report to senior leadership."),
    ("senior", ["senior", "sr.", "sr "], "5+ years",
     "You are expected to work independently, mentor junior colleagues, and drive best practices."),
]

DEFAULT_EXPERIENCE = "2–5 years"

# Titles ending in "Manager" that are usually IC roles, not people managers.
_IC_MANAGER_PHRASES = (
    "relationship manager", "account manager", "service manager",
    "portfolio manager", "product manager", "project manager",
)
_LEADERSHIP_PREFIXES = (
    "area ", "regional ", "zonal ", "cluster ", "branch ", "senior ", "deputy ",
    "assistant general", "general ", "national ",
)

WHAT_WE_OFFER = [
    "Competitive compensation aligned with your experience",
    "A collaborative team and a culture of learning and growth",
    "Clear career progression and skill-development opportunities",
]


def detect_family(title: str) -> dict:
    lower = f" {title.lower()} "
    for family in ROLE_FAMILIES:
        for kw in family["keywords"]:
            if kw in lower:
                return family
    return GENERIC_FAMILY


def detect_seniority(title: str) -> tuple[str, Optional[str], Optional[str]]:
    """Return (level_name, experience_line, extra_note)."""
    lower = f" {title.lower()} "
    if any(p in lower for p in _IC_MANAGER_PHRASES):
        if not any(p in lower for p in _LEADERSHIP_PREFIXES):
            return "mid", DEFAULT_EXPERIENCE, None
    for name, keywords, exp, note in SENIORITY_LEVELS:
        for kw in keywords:
            if kw in lower:
                return name, exp, note
    return "mid", DEFAULT_EXPERIENCE, None


# Acronyms starting with these letters are pronounced with a leading vowel
# sound ("an HR...", "an ML...", "an SDE...").
_VOWEL_SOUND_ACRONYM_LETTERS = set("FHLMNRSX")


def indefinite_article(phrase: str) -> str:
    word = phrase.split()[0] if phrase.split() else ""
    if word.isupper() and len(word) <= 5:
        return "an" if word[0] in _VOWEL_SOUND_ACRONYM_LETTERS else "a"
    return "an" if word[:1].lower() in "aeiou" else "a"


def generate_jd(
    title: str,
    client: Optional[str] = None,
    location: Optional[str] = None,
    open_positions: Optional[int] = None,
    notes: Optional[str] = None,
) -> str:
    title = re.sub(r"\s+", " ", title).strip()
    family = detect_family(title)
    level, experience, level_note = detect_seniority(title)
    title_lower = f" {title.lower()} "

    company = (client or "").strip() or "Our client"
    where = (location or "").strip()

    responsibilities = family["responsibilities"][:5]
    requirements = list(family["requirements"][:4])

    # Title-specific tweaks for common tech stacks (backend family is broad).
    if family["name"] == "backend":
        if " java " in title_lower or "j2ee" in title_lower or "spring" in title_lower:
            responsibilities = [
                "Design, build, and maintain Java-based backend services and RESTful APIs",
                "Work with Spring Boot, Hibernate, and relational databases (MySQL/PostgreSQL)",
                "Write clean, testable code and participate in code reviews",
                "Collaborate with frontend teams and product owners on feature delivery",
                "Troubleshoot production issues and optimize application performance",
            ]
            requirements = [
                "Strong hands-on experience with Core Java and object-oriented design",
                "Practical knowledge of Spring Boot, Spring MVC, and JPA/Hibernate",
                "Experience with SQL databases, REST APIs, and version control (Git)",
                "Good problem-solving skills and ability to work in an agile team",
            ]
        elif " python " in title_lower or "django" in title_lower or "flask" in title_lower:
            responsibilities = [
                "Build and maintain Python backend services, APIs, and data-processing workflows",
                "Design database schemas and write efficient queries",
                "Integrate third-party services and internal systems",
                "Write unit tests and participate in code reviews",
                "Collaborate with product and frontend teams to ship features on schedule",
            ]
            requirements = [
                "Strong Python programming skills and familiarity with a web framework (Django/Flask/FastAPI)",
                "Experience with SQL databases and REST API design",
                "Comfort with Git, testing, and debugging production issues",
                "Clear communication and ownership of assigned modules",
            ]

    if family["name"] == "banking_lending":
        if level == "manager":
            level_note = (
                "You will lead the lending team, own disbursement and portfolio targets, "
                "and ensure compliant, high-quality loan sourcing."
            )
            if "mortgage" in title_lower or "home loan" in title_lower or "housing loan" in title_lower:
                responsibilities = [
                    "Lead and coach a team of mortgage/home-loan relationship managers or officers",
                    "Drive monthly disbursement, login, and sanction targets across branch and partner channels",
                    "Build relationships with builders, brokers, DSAs, and referral partners to grow the pipeline",
                    "Review file quality, documentation completeness, and turnaround with credit and operations",
                    "Monitor portfolio health, early delinquency, and ensure adherence to RBI and internal policies",
                ]
                requirements = [
                    "Proven experience leading a mortgage or home-loan sales team in a bank or NBFC",
                    "Strong knowledge of home-loan products, LTV norms, documentation, and underwriting basics",
                    "Track record of achieving disbursement targets and managing partner/channel networks",
                    "Excellent stakeholder management with credit, operations, legal, and branch leadership",
                ]
            else:
                responsibilities = [
                    "Lead a team of relationship managers or loan officers to achieve lending targets",
                    "Own branch/area disbursement, login, and cross-sell goals with clear weekly tracking",
                    "Coach the team on product knowledge, objection handling, and compliant selling practices",
                    "Partner with credit, operations, and collections to improve TAT and portfolio quality",
                    "Ensure KYC/AML compliance, audit readiness, and accurate reporting to regional leadership",
                ]
                requirements = [
                    "Experience managing a retail lending, personal loan, or banking sales team",
                    "Strong understanding of loan products, documentation, and regulatory compliance",
                    "Demonstrated success in target achievement and team development",
                    "Good analytical skills for pipeline review, forecasting, and performance management",
                ]

    # Role summary
    summary_bits = [
        f"{company} is looking for {indefinite_article(title)} {title}"
        + (f" based in {where}" if where else "")
        + f" to join the team, {family['summary']}."
    ]
    if open_positions and int(open_positions) > 1:
        summary_bits.append(f"We are hiring for {int(open_positions)} open positions.")
    if level_note:
        summary_bits.append(level_note)
    if notes and notes.strip():
        summary_bits.append(notes.strip().rstrip(".") + ".")

    # Family-specific experience (e.g. "0–2 years, freshers welcome" for
    # telecallers) beats the generic mid-level default, but explicit seniority
    # in the title ("Senior Telecaller") still wins.
    if level == "mid" and family.get("experience"):
        requirements.insert(0, f"Experience: {family['experience']}")
    elif experience:
        requirements.insert(0, f"{experience} of relevant experience")
    if level == "intern":
        requirements = [r for r in requirements if "experience" not in r.lower()][:3]
        requirements.append("Currently pursuing or recently completed a relevant degree")

    offer = list(WHAT_WE_OFFER)
    if where:
        offer.append(f"The stability of working with an established team in {where}")

    sections = [
        " ".join(summary_bits),
        "Key Responsibilities:\n" + "\n".join(f"- {r}" for r in responsibilities),
        "Requirements:\n" + "\n".join(f"- {r}" for r in requirements),
    ]
    for heading, bullets in family.get("extras", []):
        sections.append(f"{heading}:\n" + "\n".join(f"- {b}" for b in bullets))
    sections.append("What We Offer:\n" + "\n".join(f"- {o}" for o in offer))
    return "\n\n".join(sections)
