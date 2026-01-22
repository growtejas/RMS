# AI Coding Agent Instructions for RBM Resource Module

## Project Overview

RBM (Resource Business Management) Resource Fulfillment Module is a FastAPI backend with PostgreSQL database managing:

- **Employee lifecycle**: profiles, assignments, availability, contacts, finance, skills, education
- **Organizational structure**: departments, locations, roles, RBAC
- **Resource requisitions**: requisition header/items, approval workflows, status tracking
- **Audit & security**: user authentication, role-based access control, audit logging

Frontend is a minimal React app with axios (under `/frontend`).

## Architecture

### Backend Structure

```
backend/
├── main.py                 # FastAPI app setup, router registration
├── database.py             # SQLAlchemy engine & session config
├── alembic.ini             # Database migration config
├── alembic/env.py          # Migration environment setup
├── api/                    # API endpoint routers (one per domain)
├── db/models/              # SQLAlchemy ORM models
├── schemas/                # Pydantic request/response schemas
├── utils/                  # Utilities (security.py has password hashing)
└── db/                     # Database config & session management
```

### Key Components

**API Layers (FastAPI routers in `/api`)**:

- Follow pattern: `router = APIRouter(prefix="/endpoint", tags=["Domain"])`
- Each domain has dedicated file: `employees.py`, `requisitions.py`, `skills.py`, etc.
- Standard CRUD operations: POST (create), GET (list/read), PUT (update), DELETE (optional)
- All routes inject `db: Session = Depends(get_db)` for database access

**Database Layer**:

- SQLAlchemy ORM models in `/db/models/` mirror schema files in `/schemas/`
- Models use `Base` from `db.base.Base` as declarative base
- **Critical**: Models must be imported in `/db/models/__init__.py` for Alembic auto-detection
- Foreign keys reference integer PKs or string PKs (e.g., `emp_id: str`)
- Timestamp fields use `TIMESTAMP, server_default=func.now()`

**Schema Pattern (Pydantic)**:

- Separate classes for Create, Update, Response
- Response classes use `class Config: from_attributes = True` for ORM-to-Pydantic mapping
- Email fields use `EmailStr` from pydantic

**Database Migrations (Alembic)**:

- Run migrations: `python -m alembic upgrade head` (from `/backend`)
- Generate migration: `python -m alembic revision --autogenerate -m "description"`
- Migration file structure in `/backend/alembic/versions/`

## Critical Conventions

1. **Database Session Dependency**: Always use `Depends(get_db)` in route signatures

   ```python
   @router.post("/")
   def create_item(payload: ItemCreate, db: Session = Depends(get_db)):
   ```

2. **Model Registry**: Import all models in `/db/models/__init__.py` so Alembic can auto-detect schema changes

3. **Duplicate Imports**: `/api/requisitions.py` and some models have duplicate imports—consolidate to single occurrence when editing

4. **Environment Setup**:
   - DB credentials in `.env` (DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME)
   - URL encoding for special chars: `quote_plus(os.getenv("DB_PASSWORD"))`

5. **Status Fields**: Use `CheckConstraint` for enum-like columns (e.g., `emp_status IN ('Active', 'On Leave', 'Exited')`)

6. **Error Handling**: Use `HTTPException(status_code=..., detail="message")` from FastAPI

## Common Workflows

**Adding a New Resource Type**:

1. Create model in `/db/models/new_resource.py`
2. Import in `/db/models/__init__.py`
3. Create schema in `/schemas/new_resource.py` (Create, Update, Response)
4. Create API router in `/api/new_resource.py` with CRUD endpoints
5. Include router in `main.py`: `app.include_router(new_resource_router)`
6. Generate migration: `alembic revision --autogenerate -m "add new_resource"`
7. Apply: `alembic upgrade head`

**Database Changes**:

- Always use Alembic—never modify schema directly
- Run `alembic upgrade head` after pulling/updating migrations
- Auto-generate captures most changes; verify generated migration file before applying

**Testing Workflows** (inferred from setup):

- Migrations use `upgrade head` pattern
- FastAPI auto-generates OpenAPI docs at `/docs`

## Domain Models Overview

| Domain          | Key Files                               | Primary Key    | Notes                                            |
| --------------- | --------------------------------------- | -------------- | ------------------------------------------------ |
| **Employee**    | `employee.py`                           | `emp_id: str`  | Core entity; status enum-constrained             |
| **User**        | `auth.py`                               | `user_id: int` | Auth/RBAC; maps to employees via UserEmployeeMap |
| **Requisition** | `requisition.py`, `requisition_item.py` | `req_id: int`  | Header/item split; refs to users for approval    |
| **Skills**      | `skill.py`, `employee_skill.py`         | Separate ids   | M2M relationship pattern                         |
| **Org**         | `department.py`, `location.py`          | Auto-increment | Hierarchical reference                           |

## Integration Points

- **User-Employee Mapping** (`user_employee_map.py`): Links auth users to employees—check when creating employees with login roles
- **Audit Logging** (`audit_log.py`): Automatic tracking of changes (implement trigger/middleware as needed)
- **Requisition Workflow**: Status changes tracked in `requisition_status_history.py`

## Dependencies

- **Core**: FastAPI, SQLAlchemy, Pydantic, Alembic
- **Database**: psycopg2 (PostgreSQL driver)
- **Security**: passlib (password hashing via pbkdf2_sha256), python-dotenv
- **Frontend**: axios (see `package.json`)

## Notes for Improvement

- Deduplicate imports in `/api/requisitions.py` (imports defined twice)
- Frontend `/package.json` is minimal—likely needs React/ReactDOM/build config
- Security: Ensure RBAC is enforced in route handlers (currently not visible)
- API response consistency: Some endpoints return objects, others return `{"message": "...", "id": ...}` format
