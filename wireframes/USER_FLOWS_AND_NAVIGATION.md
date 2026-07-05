# User Flows & Navigation Architecture

## Complete User Journey Maps

---

## FLOW 1: RECRUITER DAILY WORKFLOW

### Morning Check-in (5-10 min)
```
Login
  ↓
Dashboard (KPI review)
  ├→ Check metrics (interviews, follow-ups)
  ├→ Review AI recommendations
  └→ Check notifications
  ↓
WhatsApp Inbox (check messages)
  ├→ Reply to candidate inquiries
  ├→ Use AI suggested responses
  └→ Schedule follow-ups
  ↓
Pipeline (review candidates)
  ├→ Check for stuck candidates
  ├→ Move qualified to next stage
  └→ Identify hot leads
  ↓
Interviews (today's schedule)
  └→ Join Zoom/Meet calls
```

---

## FLOW 2: CANDIDATE QUALIFICATION

### Step-by-step Process
```
Find Candidate
  ├→ Search or view recommendation
  ├→ Open candidate details
  ├→ Review resume & profile
  └→ Check AI score & insights
  ↓
Assess Fit
  ├→ Review skills match
  ├→ Check experience relevance
  └→ Note any concerns
  ↓
Take Action
  ├→ If qualified: Move to next stage
  ├→ If needs info: Send WhatsApp
  ├→ If interested: Schedule interview
  └→ If not fit: Reject with feedback
  ↓
Update Pipeline
  └→ Drag to appropriate column
```

---

## FLOW 3: INTERVIEW SCHEDULING

### Scheduling Process
```
Candidate Ready for Interview
  ↓
Open Calendar
  ├→ View availability
  ├→ Check recruiter schedule
  └→ Find overlaps
  ↓
Select Time Slot
  ├→ Prefer morning/afternoon
  ├→ Avoid conflicts
  └→ Add buffer time
  ↓
Send Calendar Invite
  ├→ WhatsApp + Email
  ├→ Include Zoom link
  └→ Reminder settings
  ↓
Update Pipeline
  └→ Move to "Interview Scheduled"
```

---

## FLOW 4: WHATSAPP ENGAGEMENT

### Message-based Workflow
```
New Message from Candidate
  ↓
View in Shared Inbox
  ├→ Check conversation history
  ├→ Review candidate profile context
  └→ See AI suggestions
  ↓
Respond
  ├→ Use AI suggested reply
  ├→ Or type custom message
  ├→ Share files/docs as needed
  └→ Set follow-up reminder
  ↓
Log Activity
  └→ Auto-tracked in candidate profile
```

---

## FLOW 5: AI-POWERED INSIGHTS

### Data-driven Decision Making
```
Dashboard Landing
  ↓
View AI Recommendations
  ├→ "Follow up Arun - No response in 5 days"
  ├→ "Schedule with Neha - Top match"
  ├→ "Update pipeline status - High drop-off"
  └→ "Anil needs 3 more candidates"
  ↓
Click Recommendation
  ├→ Opens relevant candidate/job
  ├→ Shows reason for recommendation
  └→ Suggests next action
  ↓
Take Action
  ├→ Schedule interview
  ├→ Send message
  ├→ Move candidate
  └→ Export data
```

---

## Navigation Map

### Information Architecture

```
AIOS RECRUITMENT
│
├─ DASHBOARD (Home/Overview)
│  ├─ KPI Cards
│  ├─ Hiring Funnel
│  ├─ Recent Activity
│  ├─ AI Recommendations
│  └─ Quick Stats
│
├─ PIPELINE (Candidate Management)
│  ├─ View by Job Role
│  │  ├─ Applied → Joined (Kanban)
│  │  ├─ Filter & Search
│  │  ├─ Bulk Actions
│  │  └─ Export
│  │
│  └─ Candidate Details
│     ├─ Profile & Resume
│     ├─ Experience Timeline
│     ├─ Interview History
│     ├─ Activity Log
│     ├─ AI Insights
│     └─ Quick Actions
│
├─ JOB OPENINGS (Job Management)
│  ├─ Active Positions List
│  │  ├─ Search & Filter
│  │  ├─ By Client/Company
│  │  └─ By Recruiter
│  │
│  └─ Job Details
│     ├─ Requirements
│     ├─ Candidate Pipeline
│     ├─ Performance Metrics
│     ├─ AI Recommendations
│     └─ Assign Recruiter
│
├─ WHATSAPP INBOX (Communications)
│  ├─ Conversation List
│  ├─ Active Chat
│  │  ├─ Message History
│  │  ├─ AI Suggested Replies
│  │  ├─ Quick Templates
│  │  ├─ File Sharing
│  │  └─ Scheduling
│  │
│  ├─ Broadcast
│  │  ├─ Message Segments
│  │  ├─ Schedule Send
│  │  └─ Analytics
│  │
│  └─ Settings
│     ├─ Business Account
│     └─ Message Templates
│
├─ INTERVIEWS (Scheduling & Interviews)
│  ├─ Calendar View
│  │  ├─ Monthly Calendar
│  │  ├─ Day View
│  │  └─ Recruiter View
│  │
│  ├─ Schedule Management
│  │  ├─ Create Interview
│  │  ├─ Select Slot
│  │  ├─ Invite Candidate
│  │  └─ Set Reminders
│  │
│  ├─ Interview Details
│  │  ├─ Candidate Info
│  │  ├─ Interview Type (Phone/Video)
│  │  ├─ Zoom/Meet Link
│  │  ├─ Interview Notes
│  │  └─ Evaluation Form
│  │
│  └─ Video Call
│     ├─ Live Chat
│     ├─ Screen Share
│     ├─ Recording
│     └─ Evaluation
│
├─ ANALYTICS (Insights & Reports)
│  ├─ Dashboard
│  │  ├─ Key Metrics
│  │  ├─ Charts & Trends
│  │  └─ Comparisons
│  │
│  ├─ Recruiter Performance
│  │  ├─ Placements
│  │  ├─ Time-to-Hire
│  │  ├─ Conversion Rate
│  │  └─ Pipeline Health
│  │
│  ├─ Hiring Funnel
│  │  ├─ Stage Breakdown
│  │  ├─ Conversion %
│  │  └─ Drop-off Analysis
│  │
│  ├─ Source Analysis
│  │  ├─ Source Performance
│  │  ├─ Cost per Hire
│  │  └─ ROI
│  │
│  └─ Export & Reports
│     ├─ PDF Reports
│     ├─ CSV Export
│     └─ Scheduled Reports
│
└─ SETTINGS (Configuration & Admin)
   ├─ Team Management
   │  ├─ Add/Remove Members
   │  ├─ Roles & Permissions
   │  └─ Team Hierarchy
   │
   ├─ Job Openings Setup
   │  ├─ Job Templates
   │  ├─ Client Management
   │  └─ Designation Setup
   │
   ├─ WhatsApp Integration
   │  ├─ Connect Account
   │  ├─ Verify Number
   │  ├─ Message Templates
   │  └─ Approval
   │
   ├─ Integrations
   │  ├─ Calendar (Google/Outlook)
   │  ├─ Zoom/Google Meet
   │  ├─ Email (Gmail/Outlook)
   │  ├─ API Keys
   │  └─ Webhooks
   │
   ├─ Branding
   │  ├─ Company Logo
   │  ├─ Colors & Theme
   │  ├─ Email Templates
   │  └─ Message Signature
   │
   ├─ Notifications
   │  ├─ Email Alerts
   │  ├─ WhatsApp Notifications
   │  ├─ In-app Alerts
   │  └─ Preferences
   │
   └─ Security & Compliance
      ├─ Password Policy
      ├─ Two-Factor Auth
      ├─ Data Privacy
      ├─ Audit Logs
      └─ API Rate Limits
```

---

## Context-Aware Shortcuts

### Quick Access Patterns

#### From Dashboard
- Pending Follow-ups → WhatsApp Inbox
- Hot Candidates → Candidate Details
- Interviews Today → Calendar View
- New Candidate → Pipeline

#### From Pipeline
- Card Click → Candidate Details
- Quick Message → WhatsApp (context)
- Schedule Interview → Calendar
- Bulk Actions → Move Multiple

#### From Candidate Details
- Schedule Interview → Calendar
- Send Message → WhatsApp
- Add Note → Notes Panel
- Update Status → Pipeline

#### From WhatsApp
- View Profile → Candidate Details
- Schedule Interview → Calendar
- Send Files → Upload Dialog
- Template Library → Quick Templates

---

## Mobile Navigation

### Bottom Tab Navigation (Primary)
```
┌─────┬─────┬─────┬─────┐
│  📊  │  🎯  │  💬  │  👤  │  ← Tab Navigation
│Dashboard│Pipeline│Messages│Profile│
└─────┴─────┴─────┴─────┘
```

### Tab Definitions
- **Dashboard** (📊): Home, KPIs, AI insights
- **Pipeline** (🎯): Candidates, Jobs, Kanban
- **Messages** (💬): WhatsApp inbox, chat
- **Profile** (👤): User settings, account

### Mobile Sidebar (Hidden by Default)
- Accessible via hamburger menu
- Shows all navigation items
- Full-screen overlay on mobile

### Mobile Breadcrumbs
```
< Back | Dashboard / Pipeline / Java Dev / Raj Kumar
```

---

## Keyboard Navigation & Shortcuts

### Global Shortcuts
- `Cmd/Ctrl + K`: Global search
- `Cmd/Ctrl + /`: Help & shortcuts
- `Cmd/Ctrl + B`: Toggle sidebar
- `Escape`: Close modals/overlays

### Pipeline Shortcuts
- `J`: Jump to job filter
- `N`: New candidate
- `D`: Open details
- `C`: Create note
- `Arrow Keys`: Navigate cards

### WhatsApp Shortcuts
- `R`: Reply to message
- `F`: Mark as follow-up
- `S`: Send suggested reply
- `T`: Quick template

### Interview Shortcuts
- `C`: Create interview
- `→`: Next day
- `←`: Previous day

---

## Deep Linking

### URL Structure for Share/Bookmarking

```
/dashboard                           → Main dashboard
/pipeline/[jobId]                    → Job pipeline view
/candidate/[candidateId]             → Candidate profile
/candidate/[candidateId]/resume      → Candidate resume
/job-opening/[jobId]                 → Job details
/messages/[conversationId]           → Specific conversation
/interviews/calendar/[date]          → Date-specific calendar
/analytics/recruiter/[recruiterId]   → Recruiter performance
/settings/team                       → Team settings
```

### Share Examples
- Share pipeline: `/pipeline/java-dev-mumbai`
- Share candidate: `/candidate/raj-kumar-12345`
- Share interview: `/interviews/meeting-id-12345`

---

## Search & Filter Architecture

### Global Search
- Searches across:
  - Candidates (name, email, phone)
  - Jobs (title, company)
  - Companies (client names)
  - Recruiters (names)
  - Messages (content)

### Pipeline Filters
- Job Role (multi-select)
- Experience Level
- Location
- Skills
- AI Score Range
- Salary Range
- Status (stage)
- Assigned Recruiter

### WhatsApp Filters
- Unread Messages
- Starred Conversations
- By Candidate Name
- By Date Range
- By Status

### Analytics Filters
- Date Range (Presets: This week, month, quarter, year)
- Recruiter (multi-select)
- Job Role (multi-select)
- Status
- Source

---

## Error & Empty States

### Empty States Shown
- New workspace (empty pipeline)
- No search results
- No messages yet
- No scheduled interviews
- No analytics data (insufficient)

### Error States Handled
- Network errors (retry option)
- Permission errors (upgrade prompt)
- Data sync errors (queue for later)
- Failed integrations (reconnect option)

---

## Loading & Skeleton States

### Skeleton Loaders for:
- Dashboard cards (KPI loading)
- Pipeline cards (bulk load)
- Chat messages (real-time sync)
- Calendar events (fetch optimization)
- Analytics charts (data aggregation)

---

## State Persistence

### Local Storage
- User preferences (sidebar collapsed, theme)
- Recent searches
- Filter selections
- Draft messages

### Server Sync
- Candidate updates (real-time)
- Message delivery status
- Interview confirmations
- Team member activities

---

## Notification Flows

### In-App Notifications
```
Type: New Message
├─ "Raj Kumar replied"
├─ Click action: Open chat
└─ Dismiss option

Type: Interview Reminder
├─ "Interview in 30 min"
├─ Action: Join/Reschedule
└─ Snooze option

Type: Candidate Status Change
├─ "3 new qualified candidates"
├─ Action: View Pipeline
└─ Settings link
```

### Priority Levels
- **Critical** (Red): Interview starting, high-urgency message
- **Important** (Amber): Follow-up overdue, candidate rejected
- **Info** (Blue): Message received, candidate moved
- **Success** (Green): Interview scheduled, placement confirmed

