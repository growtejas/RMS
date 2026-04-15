# AI Coding Agent Instructions for RBM Resource Module

## Big picture

- One app in active use: Next.js (`rms-next/`) which serves both UI routes and `/api/*` endpoints.
- A legacy FastAPI backend still exists in `backend/` for reference during cutover, but the goal is to run standalone on Next.
- Auth uses JWT: token stored in localStorage as authToken and injected by the Axios request interceptor.

## Backend conventions (FastAPI + SQLAlchemy)

- Routers live in backend/api/\*.py and are registered in backend/main.py with prefix="/api".
- Route handlers always inject DB sessions via `db: Session = Depends(get_db)` from backend/database.py.
- SQLAlchemy models are in backend/db/models; Pydantic schemas in backend/schemas (Create/Update/Response split).
- Response schemas use `class Config: from_attributes = True` for ORM mapping.
- IMPORTANT: new models must be imported in backend/db/models/**init**.py for Alembic autogenerate.
- DB config reads backend/.env (DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME) and URL-encodes credentials with `quote_plus`.
- Enum-like fields typically use `CheckConstraint` (see employee status in models).
- Known cleanup: backend/api/requisitions.py contains duplicate imports; consolidate when editing.

## Frontend conventions (Next.js App Router)

- UI lives under `rms-next/src/app/**` and `rms-next/src/components/**`.
- API routes live under `rms-next/src/app/api/**` and are consumed from the browser via same-origin `/api` (see `rms-next/src/lib/api/client.ts`).
- Auth state is managed in `rms-next/src/contexts/**` (token in localStorage; interceptor adds `Authorization: Bearer ...`).
- Styles are plain CSS under `rms-next/src/styles/**`.

## Workflows & scripts (from repo config)

- Root package.json provides npm run dev/build to run Next commands in `rms-next/`.
- Database migrations live in backend/alembic; use Alembic from backend/ (revision/upgrade head).

## Cross-component integration points

- Auth endpoints in backend/api/auth.py with JWT utilities in backend/utils/jwt.py and password hashing in backend/utils/security.py.
- Requisition workflow splits header/items across backend/api/requisitions.py and requisition_items.py.
- Audit trail is tracked in backend/api/audit_log.py and requisition_status_history.py.
