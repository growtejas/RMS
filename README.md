# Resource Fulfillment System

**End-to-end requisition and hiring workflow — from request to allocation.**

A full-stack web application that manages the lifecycle of hiring requests (requisitions) from creation through to employee allocation. Built for role-based workflows across Managers, HR, Talent Acquisition, and Admin with audit-ready data and RBAC.

---

## Overview

The Resource Fulfillment System (RFS) centralizes resource requests, approvals, and fulfillment in one place. Managers raise requisitions; HR approves and assigns Talent Acquisition; TAs manage positions, candidates, and allocations; and the system prevents over-allocation and keeps a full audit trail.

- **Modular monolith** — single deployable backend with clear domain boundaries  
- **Role-based workflows** — Manager → HR → TA → Fulfillment with configurable transitions  
- **Multi-position requisitions** — each requisition can have multiple items (roles/skills)  
- **ATS-lite** — candidate intake from career page with resume upload and pipeline stages  

---

## Key Features

| Area | Capabilities |
|------|----------------|
| **Requisitions** | Raise, approve (budget + HR), assign TA, track items, auto-close when all positions are fulfilled or cancelled |
| **Workflow** | Draft → Pending Budget → Pending HR → Active → Fulfilled; reject/cancel paths; status history |
| **Items** | Multiple positions per requisition; skill, level, JD; item-level TA assignment; status per item (Pending, Sourcing, Shortlisted, Interviewing, Offered, Fulfilled, Cancelled) |
| **Employees** | Onboarding, core profile, contacts, skills, education, deployment/availability, restricted financial data |
| **Skills** | Central skill catalog; link employees and requisition items to skills with proficiency and years |
| **Allocation** | Assign employees to requisition items; guardrails to prevent over-allocation |
| **Candidates** | Create candidates, attach to items, upload resumes, move through pipeline stages |
| **Access** | RBAC (Manager, HR, TA, Admin); JWT auth; role-scoped APIs and UI; URL-based nested routes per role |
| **Audit** | Structured audit log (write operations only); export; status and workflow history |
| **UI** | Load-more pagination on requisition lists, audit log, and alerts; multi-step Create Employee form; Employee Profile aligned with create flow; Quick Stats & Quick Actions on requisition detail (HR & TA) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         React SPA (Vite + TypeScript)                     │
│  Manager │ HR │ TA │ Admin dashboards, requisitions, employees, audit    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ REST + JWT
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FastAPI (Modular Monolith)                          │
│  /api/requisitions │ /api/employees │ /api/skills │ /api/dashboard │ ...  │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ SQLAlchemy ORM
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           PostgreSQL                                      │
│  requisitions, items, employees, skills, candidates, audit_log, auth      │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Frontend:** Single-page app with route-based dashboards per role (Manager, HR, TA, Admin).  
- **Backend:** REST APIs under `/api/*`; workflow and status rules enforced in service layer; CORS and JWT for browser clients.  
- **Database:** PostgreSQL with Alembic migrations; indexes and constraints for workflow and audit.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.11+, FastAPI |
| **Frontend** | React 19, TypeScript, Vite |
| **Database** | PostgreSQL |
| **ORM** | SQLAlchemy 2.x |
| **Migrations** | Alembic |
| **Auth** | JWT (python-jose), bcrypt (passlib) |
| **Styling** | CSS, Tailwind CSS |
| **HTTP client** | Axios |

---

## Installation & Setup

### Prerequisites

- **Python 3.11+** (backend)  
- **Node.js 18+** and npm (frontend)  
- **PostgreSQL** (running and reachable)

### Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
# source venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` in `backend/` (see [Environment Variables](#environment-variables)). Then run migrations and start the API:

```bash
# From backend/
alembic upgrade head
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs: **http://localhost:8000/docs**

### Frontend

```bash
cd rbm-rfm-frontend
npm install
```

Copy `.env.example` to `.env` and set `VITE_API_BASE_URL` (e.g. `http://localhost:8000/api`). Then:

```bash
npm run dev
```

App: **http://localhost:5173**

### One-shot dependency install (optional)

From project root:

- **Windows (PowerShell):** `.\install-dependencies.ps1`  
- **Linux/macOS (Bash):** `./install-dependencies.sh`  

These install backend (pip) and frontend (npm) dependencies only; you still need to configure `.env`, run Alembic, and start both servers.

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Database (required)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_db_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# Optional
MANAGER_SLA_DAYS=30
STORAGE_TYPE=local
STORAGE_LOCAL_DIR=storage/jd
JD_UPLOAD_DIR=uploads/jd
RESUME_UPLOAD_DIR=uploads/resumes
# For S3:
# STORAGE_TYPE=s3
# STORAGE_S3_BUCKET=your-bucket
# STORAGE_S3_PREFIX=jd
```

### Frontend (`rbm-rfm-frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:8000/api
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
├── backend/
│   ├── api/              # FastAPI route modules (requisitions, employees, skills, dashboard, etc.)
│   ├── db/               # SQLAlchemy models, engine, session
│   ├── services/         # Business logic (workflow, requisition engine, storage); services/requisition for workflow matrix
│   ├── schemas/          # Pydantic request/response models
│   ├── utils/            # Helpers (dependencies, auth, storage)
│   ├── alembic/          # Database migrations
│   ├── main.py           # App entry, CORS, router registration
│   └── requirements.txt
├── rbm-rfm-frontend/
│   ├── src/
│   │   ├── components/   # React components (admin, hr, ta, manager, shared)
│   │   ├── routes/       # App router and route config
│   │   ├── api/          # API client and service calls
│   │   ├── contexts/    # Auth and app context
│   │   ├── types/        # TypeScript types and workflow enums
│   │   └── styles/       # Global and module CSS
│   ├── package.json
│   └── vite.config.ts
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

| Dashboard / Screen | Description |
|--------------------|-------------|
| Manager dashboard  | Metrics, raise requisition, my requisitions |
| HR dashboard       | Pending approvals, requisitions, employee list |
| TA dashboard       | Assignments, SLA, requisitions, resource pool |
| Admin              | Users, master data, audit log |
| Requisition detail | Items, candidates, timeline, Quick Stats / Quick Actions |

---

## Author / Credits

**Resource Fulfillment System** — developed as part of the RBM Resource Module initiative.

For questions or contributions, please open an issue or pull request in the repository.
