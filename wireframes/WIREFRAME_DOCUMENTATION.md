# AIOS Recruitment - Wireframe Documentation

## Project Overview
AIOS (AI Operating System) Recruitment is a modern, AI-first SaaS platform designed for Indian recruitment agencies and staffing firms. The platform reduces manual work through AI automation, WhatsApp workflows, and smart hiring pipelines.

---

## Design System

### Color Palette
- **Primary**: `#6366f1` (Indigo) - Action, active states
- **Secondary**: `#ec4899` (Pink) - Accents, highlights
- **Background**: `#ffffff` (White) - Main background
- **Surface**: `#f8fafc` (Light slate) - Cards, surfaces
- **Border**: `#e2e8f0` (Subtle gray) - Dividers, borders
- **Text**: `#1e293b` (Dark slate) - Primary text
- **Text Secondary**: `#64748b` (Medium slate) - Secondary text
- **Success**: `#10b981` (Green) - Positive actions
- **Warning**: `#f59e0b` (Amber) - Caution states
- **Danger**: `#ef4444` (Red) - Errors, urgency

### Typography
- **Font Family**: System fonts (SF Pro Display, Segoe UI, etc.)
- **Headings**: Roboto/System font, 700 weight
- **Body**: System font, 400/500 weight
- **Sizes**:
  - H1: 2rem / 2.5rem
  - H2: 1.5rem / 1.75rem
  - H3: 1.1rem / 1.3rem
  - Body: 0.9rem / 0.95rem
  - Small: 0.85rem / 0.9rem
  - Micro: 0.75rem / 0.8rem

### Spacing Scale
- 4px, 8px, 12px, 16px, 24px, 32px, 48px
- Used consistently across padding, margins, gaps

### Border Radius
- Compact: 4px (buttons, small elements)
- Standard: 8px (cards, inputs)
- Large: 12px (containers, cards)
- Extra Large: 20px (illustrations)
- Circular: 50% (avatars, floating buttons)

### Shadows
- Subtle: `0 2px 8px rgba(0,0,0,0.05)`
- Medium: `0 4px 12px rgba(0,0,0,0.08)`
- Large: `0 8px 16px rgba(99, 102, 241, 0.3)`
- Hover: Slight elevation with increased shadow

---

## Page Wireframes

### 1. LOGIN PAGE
**Purpose**: Authenticate recruiters and onboard new users

**Layout**: Split-screen design
- **Left side**: AI illustration + brand messaging (gradient background)
- **Right side**: Login form + OAuth options

**Key Elements**:
- Email/password inputs
- Google & Microsoft OAuth buttons
- "Start free trial" CTA
- Modern split-screen aesthetic
- AI/tech illustration

**Mobile**: Full-width stacked form

---

### 2. MAIN DASHBOARD
**Purpose**: Executive overview and quick action center

**Layout**: Sidebar + top navigation + main content

**Key Sections**:
- **KPI Cards** (4 columns):
  - Total Candidates
  - Interviews Today
  - Pending Follow-ups
  - Hot Candidates
- **Hiring Funnel Chart** (visual representation)
- **Recent Activity Feed** (timeline)
- **AI Recommendations** (side panel)
- **Floating Action Button** (quick actions)

**Interactions**:
- Sidebar navigation with active states
- Search bar with global search
- Notification bell with badge
- User profile menu

---

### 3. CANDIDATE PIPELINE (KANBAN BOARD)
**Purpose**: Manage candidates through hiring stages

**Layout**: Horizontal scrolling Kanban with 5-6 columns

**Columns**:
1. Applied
2. Screening
3. Interview Scheduled
4. Selected
5. Rejected
6. Joined

**Candidate Card**:
- Candidate name
- 2-3 skills (tags)
- Experience level
- AI score (8.2/10 style)
- Recruiter assignment
- Drag & drop enabled

**Features**:
- Filters (role, experience, location)
- Search functionality
- Bulk actions
- Quick preview

---

### 4. CANDIDATE DETAILS PAGE
**Purpose**: Comprehensive candidate profile and management

**Layout**: 3-column grid
- **Left (Main)**: Resume + Experience + Interview History
- **Middle**: Chat/Communication
- **Right Sidebar**: AI Score, Skills, Insights

**Key Sections**:
- Profile header (name, title, experience)
- Resume preview
- Experience timeline
- Interview history with scores
- AI-generated insights
- Recruiter notes
- Action buttons (Schedule, Move, Reject, etc.)

**Features**:
- Sticky action buttons (top right)
- AI insights panel
- Communication history
- Interview notes
- Salary insights

---

### 5. JOB OPENINGS PAGE
**Purpose**: Manage and track active job openings

**Layout**: Card grid (3-column)

**Job Card Contains**:
- Job title + company
- Status badge (Active/Urgent/Closed)
- Assigned recruiter
- Open positions count
- Candidate match %
- In-pipeline count

**Features**:
- Create new job opening
- Status filtering
- Quick editing
- Performance metrics

---

### 6. WHATSAPP SHARED INBOX
**Purpose**: Central messaging hub for candidate communication

**Layout**: 3-panel messaging interface
- **Left Panel**: Conversation list (280px)
- **Center Panel**: Active chat (main area)
- **Right Panel**: AI suggestions (320px)

**Key Features**:
- Real-time conversations
- AI-suggested replies
- Quick templates
- Recruiter assignment
- Broadcast messaging
- Message history
- Status indicators

**AI Suggestions Include**:
- Smart reply suggestions
- Template quick access
- Candidate insights
- Next action recommendations

---

### 7. INTERVIEW SCHEDULING PAGE
**Purpose**: Manage interview calendar and slots

**Layout**: 2-column (Calendar + Sidebar)

**Left Section**:
- Monthly calendar view
- Day-by-day schedule
- Time slots
- Interview details

**Right Section**:
- Upcoming interviews
- Quick join links
- Reschedule options
- Candidate details

**Features**:
- Drag & drop scheduling
- Zoom/Meet integration
- Calendar sync
- Automated reminders
- Interview notes

---

### 8. ANALYTICS & INSIGHTS PAGE
**Purpose**: Performance metrics and hiring analytics

**Key Metrics** (KPI Cards):
- Total Placements
- Conversion Rate
- Average Time-to-Hire
- Interview Success Rate

**Charts**:
- Recruiter Performance
- Hiring Funnel
- Source-wise Conversion
- Monthly Placements Trend
- Interview Success Rate

**Filters**:
- Date range
- Recruiter
- Job role
- Client/Company

---

### 9. SETTINGS PAGE
**Purpose**: Configuration and team management

**Left Sidebar Navigation**:
- Team Management
- API Keys
- Integrations
- Branding
- Security

**Team Section**:
- Team members list
- Roles & permissions
- Add new member
- Edit/remove options

**Integrations**:
- WhatsApp configuration
- Calendar sync
- Zoom/Google Meet
- Email integration

---

## Mobile Wireframes

### Mobile Breakpoints
- **Tablet**: 768px+
- **Phone**: <768px
- **Small Phone**: <375px

### Mobile-Specific Optimizations

#### 1. **Mobile Dashboard**
- Stacked cards (single column)
- Simplified metrics
- Quick action buttons
- Bottom tab navigation

#### 2. **Mobile Pipeline**
- Horizontal scroll (one column at a time)
- Swipe-based navigation
- Tap to expand cards
- Quick add button

#### 3. **Mobile WhatsApp Inbox**
- Full-screen chat
- Floating action button for new message
- Quick reply suggestions
- Bottom-aligned input

#### 4. **Mobile Candidate Details**
- Tab-based navigation (Profile/Experience/Activity)
- Sticky action buttons (top)
- Scrollable content
- AI insights collapsed initially

#### 5. **Mobile Notifications**
- List view with badges
- Color-coded by type
- Tap to open
- Swipe to dismiss

### Mobile Navigation Pattern
- **Bottom tab navigation** (standard for Indian apps)
- 4-5 main icons
- Active state highlighted
- Icon + label on mobile

---

## User Flows

### Primary User Flows

#### 1. **Quick Follow-up Flow**
Dashboard → Find Pending → WhatsApp Inbox → Send Message → Mark Done

#### 2. **Interview Scheduling Flow**
Pipeline → Candidate Card → Schedule Interview → Select Time → Send Calendar Link

#### 3. **Candidate Processing Flow**
Pipeline → Drag to Screening → View Details → Make Notes → Update Status

#### 4. **Hot Lead Management Flow**
Dashboard → AI Recommendations → Open Candidate → Quick Actions → Engage

---

## Navigation Structure

### Main Navigation (Sidebar)
```
📊 Dashboard (Home)
🎯 Pipeline (Candidates)
💼 Job Openings
💬 WhatsApp Inbox
📅 Interviews
📈 Analytics
⚙️ Settings
```

### Secondary Navigation (Top Bar)
- Search (global)
- Notifications
- User profile menu

### Contextual Navigation
- Tabs within pages
- Breadcrumbs on detail pages
- Back button on mobile

---

## Component Specifications

### Buttons
- **Primary**: Gradient (Primary → Secondary)
- **Secondary**: Surface background with border
- **Destructive**: Red background
- **Sizes**: Small (32px), Medium (40px), Large (48px)
- **States**: Default, Hover, Active, Disabled

### Cards
- **Background**: White
- **Border**: 1px solid border color
- **Border Radius**: 12px
- **Padding**: 1.5rem
- **Shadow**: Subtle with hover lift effect
- **Hover**: Border color change + slight shadow increase

### Input Fields
- **Background**: Surface color
- **Border**: 1px solid border
- **Border Radius**: 8px
- **Padding**: 0.75rem 1rem
- **Focus State**: Primary color border + subtle shadow

### Tags/Badges
- **Skill Tags**: Surface background, rounded 4px, small padding
- **Status Badges**: Color-coded (Active=Green, Urgent=Orange)
- **AI Score**: Gradient text on white background

### Kanban Cards
- **Size**: Fixed width (300px), flexible height
- **Content**: Name, 2-3 tags, metadata, score
- **Interaction**: Hover lift, drag-enabled cursor

---

## AI Assistant Integration

### AI Features Across Platform

#### 1. **Dashboard**
- Smart recommendations panel
- Automated insights
- Follow-up suggestions

#### 2. **Pipeline**
- Score prediction
- Match percentage
- Pipeline recommendations

#### 3. **Candidate Details**
- Salary insights
- Skill assessments
- Interview readiness score

#### 4. **WhatsApp Inbox**
- Smart reply suggestions
- Template recommendations
- Optimal response timing

#### 5. **Interview Scheduling**
- Optimal slot recommendations
- Calendar analysis
- Interview prep suggestions

---

## Accessibility

### Requirements
- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader optimization
- Color contrast ratio ≥ 4.5:1
- Focus indicators visible

### Implementation
- Semantic HTML
- ARIA labels for complex components
- Keyboard shortcuts documentation
- Tab order optimization

---

## Dark Mode Ready

All components have light/dark variants:
- Background swaps to darker shade
- Text inverts (light text on dark)
- Border color adjusts
- Shadow adjusts for dark mode

**CSS Variables Used**: All colors defined as CSS custom properties for easy theme switching

---

## Performance Considerations

### Load Optimization
- Lazy loading for cards and lists
- Virtualized kanban for large datasets
- Image optimization
- Code splitting by page

### Mobile Performance
- Touch-friendly tap targets (min 48px)
- Fast interactions (200ms response)
- Optimized animations (60fps)
- Minimal data transfer

---

## Interaction Patterns

### Drag & Drop
- Visual feedback (outline change, shadow increase)
- Drop zone highlight
- Smooth animation (200ms)
- Undo capability

### Modals & Overlays
- Centered, semi-transparent background
- Maximum width: 500-600px
- Escape key to close
- Focus trap enabled

### Scrolling
- Infinite scroll for lists (optional)
- Lazy loading of items
- Smooth scroll behavior
- Sticky headers

### Search & Filter
- Real-time search results
- Filter chips (removable)
- Active filter indication
- Clear all option

---

## Next Steps & Design Refinement

1. **High-Fidelity Mockups**: Create detailed designs in Figma
2. **Prototype**: Build interactive prototypes for testing
3. **User Testing**: Validate with target recruitment users
4. **Brand Assets**: Finalize logo, colors, imagery
5. **Component Library**: Build reusable UI components
6. **Development Handoff**: Create design specs for developers

---

## Design Tools & Resources

### Recommended Tools
- **Design**: Figma, Adobe XD
- **Prototyping**: Figma, Framer, Webflow
- **User Testing**: Maze, Userlytics
- **Analytics**: Hotjar, Fullstory

### Icon Library
- Heroicons (recommended for SaaS)
- Feather Icons
- Phosphor Icons

### UI Kit Inspiration
- Linear.app UI patterns
- Ashby UI components
- Notion design system
- HubSpot UI library

---

## Questions & Clarifications

### To Discuss with Stakeholders
1. Real-time vs. eventual consistency for pipeline updates?
2. Maximum candidates per recruiter (performance)?
3. WhatsApp integration scope (broadcast, templates)?
4. Analytics data retention policy?
5. Export/reporting capabilities?

---

## Version History
- **v1.0** (May 2026): Initial wireframe suite
- Design Style: Linear, minimal, AI-first
- Target: Indian recruitment agencies
- Status: Ready for high-fidelity design phase

