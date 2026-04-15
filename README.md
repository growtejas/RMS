# Resource Fulfillment System

**End-to-end requisition and hiring workflow — from request to allocation.**

A full-stack web application that manages the lifecycle of hiring requests (requisitions) from creation through to employee allocation. Built for role-based workflows across Managers, HR, Talent Acquisition, and Admin with audit-ready data and RBAC.

---

## Overview

The Resource Fulfillment System (RFS) centralizes resource requests, approvals, and fulfillment in one place. Managers raise requisitions; HR approves and assigns Talent Acquisition; TAs manage positions, candidates, and allocations; and the system prevents over-allocation and keeps a full audit trail.

- **Modular monolith** — single deployable backend with clear domain boundaries
- **Role-based workflows** — Manager → HR → TA → Fulfillment with configurable transitions
- **Multi-position requisitions** — each requisition can have multiple items (roles/skills)

---

## Key Features

| Area             | Capabilities                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requisitions** | Raise, approve (budget + HR), assign TA, track items, auto-close when all positions are fulfilled or cancelled                                                                                            |
| **Workflow**     | Draft → Pending Budget → Pending HR → Active → Fulfilled; reject/cancel paths; status history                                                                                                             |
| **Items**        | Multiple positions per requisition; skill, level, JD; item-level TA assignment; status per item (Pending, Sourcing, Shortlisted, Interviewing, Offered, Fulfilled, Cancelled)                             |
| **Employees**    | Onboarding, core profile, contacts, skills, education, deployment/availability, restricted financial data                                                                                                 |
| **Skills**       | Central skill catalog; link employees and requisition items to skills with proficiency and years                                                                                                          |
| **Allocation**   | Assign employees to requisition items; guardrails to prevent over-allocation                                                                                                                              |
| **Candidates**   | Create candidates, attach to items, upload resumes, move through pipeline stages                                                                                                                          |
| **Access**       | RBAC (Manager, HR, TA, Admin); JWT auth; role-scoped APIs and UI; URL-based nested routes per role                                                                                                        |
| **Audit**        | Structured audit log (write operations only); export; status and workflow history                                                                                                                         |
| **UI**           | Load-more pagination on requisition lists, audit log, and alerts; multi-step Create Employee form; Employee Profile aligned with create flow; Quick Stats & Quick Actions on requisition detail (HR & TA) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Next.js (App Router) + TypeScript                      │
│  Manager │ HR │ TA │ Admin dashboards + API routes under /api            │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ DB + JWT (server) / REST (browser → /api)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           PostgreSQL                                      │
│  requisitions, items, employees, skills, candidates, audit_log, auth      │
└─────────────────────────────────────────────────────────────────────────┘
```

- **App:** Next.js pages + API routes under `/api/*`; workflow and status rules enforced server-side; JWT auth; RBAC in both API and UI.
- **Database:** PostgreSQL.

---

## Tech Stack

| Layer           | Technology                          |
| --------------- | ----------------------------------- |
| **App**         | Next.js 14 (App Router), React 18, TypeScript |
| **Database**    | PostgreSQL                          |
| **ORM**         | Drizzle ORM                         |
| **Auth**        | JWT, bcrypt                         |
| **Styling**     | CSS, Tailwind CSS                   |
| **HTTP client** | Axios                               |




---

## Installation & Setup

### Prerequisites

- **Node.js 18+** and npm
- **PostgreSQL** (running and reachable)

### App (Next.js)

```bash
cd rms-next
npm install
```

Copy `rms-next/.env.example` to `rms-next/.env.local` and set:
- `DATABASE_URL=...`
- `JWT_SECRET_KEY=...`

```bash
npm run dev
```

App: **http://localhost:3000**

### One-shot dependency install (optional)

From project root:

- **Windows (PowerShell):** `.\install-dependencies.ps1`
- **Linux/macOS (Bash):** `./install-dependencies.sh`

These install Node dependencies only; you still need to configure `rms-next/.env.local` and have a PostgreSQL schema available.

### Database migrations (Drizzle)

From `rms-next/`:

```bash
# Generate migration files from `src/lib/db/schema.ts`
npm run db:generate
# Apply migrations to your database
npm run db:migrate
```

---

## Environment Variables

### App (`rms-next/.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/rfm
JWT_SECRET_KEY=your-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=14
METRICS_BEARER_TOKEN=your-scraper-token
```

---

## Usage / How It Works

### Workflow (high level)

1. **Manager** — Creates a requisition (project, client, required-by date, priority) and adds one or more **items** (role/skill, level, education). Submits for approval.
2. **HR / Admin** — Approves budget (if applicable) and then HR approval. Requisition moves to **Active**.
3. **HR** — Assigns a **Talent Acquisition (TA)** user to the requisition (or to specific items).
4. **TA** — Works each item: sources candidates, uploads resumes, moves candidates through stages (Shortlisted, Interviewing, Offered). When a candidate is hired, assigns an **employee** to the item and marks the item **Fulfilled**.
5. **System** — When all items are Fulfilled or Cancelled, the requisition is marked **Fulfilled** and the workflow is complete.

Reject and cancel paths exist at appropriate stages; status and history are stored for audit.

### Roles

- **Manager** — Raise requisitions, view own requisitions and status, manager dashboard with metrics (Active, Fulfilled, Avg Fulfillment Days).
- **HR** — Approve requisitions, assign TAs, manage employees (onboarding, profiles, skills, contacts, education), HR dashboard, HR Workflow Guide.
- **TA** — View assigned requisitions and items, manage candidates, assign employees to items, TA dashboard with SLA and alerts, Quick Stats & Quick Actions on requisition detail.
- **Admin** — User management, master data, audit log (write-only), admin dashboard.

---

## Project Structure

```
RBM_Resource_Module/
├── rms-next/
│   ├── src/
│   │   ├── app/          # UI routes + /api routes
│   │   ├── components/   # UI components
│   │   ├── contexts/     # Auth context
│   │   ├── lib/          # DB/services/repositories/validators
│   │   └── styles/       # CSS
│   ├── .env.example
│   └── package.json
├── install-dependencies.ps1
├── install-dependencies.sh
└── README.md
```

---

## Future Enhancements

- Notifications (in-app or email) for approvals, assignments, and SLA alerts
- Advanced reporting and analytics (time-to-fill, TA workload, bottleneck analysis)
- Optional SSO / LDAP integration
- Bulk import for employees and requisitions
- Richer career-page and applicant experience
- Configurable SLA and workflow rules per tenant or org

---

## Screenshots

_Screenshots can be added here to showcase Manager, HR, TA, and Admin dashboards, requisition detail, and audit log._

| Dashboard / Screen | Description                                              |
| ------------------ | -------------------------------------------------------- |
| Manager dashboard  | Metrics, raise requisition, my requisitions              |
| HR dashboard       | Pending approvals, requisitions, employee list           |
| TA dashboard       | Assignments, SLA, requisitions, resource pool            |
| Admin              | Users, master data, audit log                            |
| Requisition detail | Items, candidates, timeline, Quick Stats / Quick Actions |

---

## Author / Credits

**Resource Fulfillment System** — developed as part of the RBM Resource Module initiative.

For questions or contributions, please open an issue or pull request in the repository.
