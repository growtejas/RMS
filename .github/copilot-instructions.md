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

**Authentication & RBAC** (`utils/jwt.py`, `utils/dependencies.py`, `api/auth.py`):

- JWT-based authentication with `python-jose` and `passlib`
- Login endpoint: `POST /auth/login` returns JWT token with user info and roles
- Token verification via `utils.jwt.verify_token()`
- Password hashing uses `pbkdf2_sha256` (see `utils/security.py`)
- RBAC dependency factories for route protection:
  - `Depends(get_current_user)` - validates JWT, returns User object
  - `Depends(require_role("RoleName"))` - requires single role
  - `Depends(require_any_role("Role1", "Role2"))` - requires any of multiple roles
- Example protected route (see `api/hr.py`):
  ```python
  @router.get("/employees")
  def list_employees(
      db: Session = Depends(get_db),
      current_user: User = Depends(require_any_role("HR", "Admin"))
  ):
  ```

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

## Implementation Notes

### Security Best Practices ✅
- **JWT Secret Key**: Stored in `utils/jwt.py` with default for dev (TODO: Move to `.env` in production)
- **Token Expiration**: 30 days default (configurable in `ACCESS_TOKEN_EXPIRE_MINUTES`)
- **Password Security**: pbkdf2_sha256 with passlib (industry standard)
- **User Status Check**: Active users only; inactive users rejected at login
- **Role-Based Access**: Flexible RBAC with single/multiple role checks

### Protecting Routes
When adding new endpoints, always protect them based on business logic:
```python
# Public endpoint
@router.get("/public")
def public_endpoint(db: Session = Depends(get_db)):
    pass

# Requires authentication
@router.post("/protected")
def protected_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pass

# Requires specific role
@router.delete("/{id}")
def admin_only(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Admin"))
):
    pass
```

### Role Setup
1. Create roles in database or via API: `POST /users` then `POST /users/{user_id}/roles`
2. Common roles: "Admin", "HR", "Manager", "Employee" (define per your needs)
3. Link users to employees: `POST /users/link-employee` (required for user-employee mapping)

## Known Improvements Needed

1. **JWT Secret Key**: Move `SECRET_KEY` from hardcoded string to `.env` variable
2. **OpenAPI Security**: Add HTTPBearer configuration to `main.py` for `/docs` endpoint
3. **Endpoint Protection**: Most endpoints unprotected—add `Depends(require_any_role(...))` based on business logic
4. **Role Seeding**: Create script to seed default roles on startup
5. **Logout Implementation**: Consider token blacklist for logout (stateless JWT makes this optional)
6. **API Response Consistency**: Standardize response format across endpoints (some return objects, others `{"message": "...", "id": ...}`)
7. **Duplicate Imports**: `/api/requisitions.py` has duplicate imports—consolidate

## Frontend Integration (React + Axios)

See `AUTH_SETUP.md` for full API documentation. Quick example:

```javascript
// Login
const response = await axios.post("/auth/login", {
  username: "user",
  password: "pass"
});
const token = response.data.access_token;

// Protected request
axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
const data = await axios.get("/hr/employees");
```

## Notes for Improvement

- Deduplicate imports in `/api/requisitions.py` (imports defined twice)
- Frontend `/package.json` is minimal—needs React/ReactDOM/build config
