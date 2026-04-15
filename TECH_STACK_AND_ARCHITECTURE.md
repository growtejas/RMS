# RBM Resource Module - Tech Stack & Architecture Prompt

## 🏗️ **Project Overview**

**RBM (Resource Business Management) Resource Fulfillment Module** is a full-stack web application for managing employee lifecycle, organizational structure, requisitions, and audit logging.

Current architecture: **Next.js (UI + `/api/*`) + PostgreSQL**.

---

## 🛠️ **Technology Stack**

### **App (UI + API)**

- **Framework**: Next.js 14 (App Router), React 18, TypeScript
- **Routing**: Next.js App Router (server + client routing)
- **HTTP Client**: Axios (with request/response interceptors for auth)
- **State Management**: React Context API + Custom Hooks (AuthContext for global auth state)
- **Code Quality**: ESLint + Prettier
- **Styling**: CSS (modular, responsive design)

### **DevOps & Tools**

- **Package Managers**: npm
- **Environment Variables**: `.env` files (DB credentials, API URLs)
- **Version Control**: Git

---

## 📂 **Project Structure**

```
RBM_Resource_Module/
├── rms-next/                      # Next.js app (UI + /api routes)
│   ├── src/
│   │   ├── app/                   # App Router pages + API routes
│   │   ├── components/            # UI components
│   │   ├── contexts/              # Auth + global state
│   │   ├── lib/                   # DB, services, repositories, validators
│   │   └── styles/                # CSS
│   ├── .env.example               # Copy to .env.local
│   └── package.json
│
└── package.json                   # Root workspace config
```

---

## 🔐 **Authentication Flow (Current)**

### **1. Login Request** (Frontend → Backend)

```
POST /api/auth/login
{
  "username": "admin",
  "password": "admin123"
}
```

### **2. Server Processing (Next.js API routes)**

The server (Next.js `/api/*`) verifies credentials, loads roles, issues **access + refresh tokens**, and sets them as **`httpOnly` cookies**.

### **3. Frontend Storage & State**

```typescript
// No localStorage tokens.
// AuthContext holds user info in memory, bootstrapped from `/api/auth/me`.
{
  user_id: 1,
  username: "admin",
  roles: ["admin", "manager"]
}
```

### **4. Protected Route Access**

```typescript
// ProtectedRoute wrapper checks:
- Is user authenticated? (token exists)
- Has user required roles? (RBAC check)
- If no: redirect to /login or /unauthorized
```

### **5. Session transport**

Auth uses **cookie-based session**. Mutating requests include a CSRF header (`x-csrf-token`).

---

## 🏛️ **Architecture Patterns**

### **Frontend Architecture**

**Component Hierarchy:**

```
App (wraps with AuthProvider)
├── AppRouter (BrowserRouter)
│   ├── /login → Login page (public)
│   ├── /dashboard → ProtectedRoute → Header + Dashboard
│   ├── /unauthorized → ProtectedRoute → Unauthorized page
│   └── / → redirect to /dashboard
```

**State Management:**

```
AuthContext (global)
├── user: { user_id, username, roles }
├── token: JWT string
├── isAuthenticated: boolean
├── isLoading: boolean
├── error: string | null
├── login(): Promise<void>
├── logout(): void
└── clearError(): void
```

### **Server Architecture**

**Router Structure:**

Next.js App Router API routes under `rms-next/src/app/api/**` implement the API surface.

**Data Layer (Single source of truth):**

```
PostgreSQL + Drizzle ORM.
Migrations are generated and applied via **Drizzle Kit**.
```

**Request Pipeline:**

```
HTTP Request
    ↓
CORS Middleware (validate origin)
    ↓
Router (find matching endpoint)
    ↓
API Handler (execute business logic)
    ↓
Database Session (SQLAlchemy ORM)
    ↓
Database Query (PostgreSQL)
    ↓
Pydantic Response Schema (serialize)
    ↓
HTTP Response (JSON)
```

---

## 🔄 **Data Flow Diagram**

### **Login Flow:**

```
User (Browser)
    ↓
Login Form (React)
    ↓ POST /api/auth/login
Backend (FastAPI)
    ↓ Query DB
PostgreSQL
    ↓ Return user + roles
Backend (FastAPI)
    ↓ Create JWT token
    ↓ Response: token + user info
Frontend (React)
    ↓ Store token + user
AuthContext (state updated)
    ↓ Redirect to /dashboard
```

### **Protected Route Access:**

```
User navigates to /dashboard
    ↓
ProtectedRoute component checks
    ↓ Is authenticated?
    ├─ NO → Redirect to /login
    └─ YES ↓
    Check required roles
    ├─ NO required roles → Render component
    ├─ Has required roles → Render component
    └─ Missing required roles → Redirect to /unauthorized
```

---

## 🎨 **Design System & CSS Variables**

### **CSS Variables Architecture**

The frontend uses a comprehensive CSS variables system for easy customization and consistency:

**Location**: `src/styles/variables.css`

**Variable Categories**:

- **Colors**: Primary, secondary, text, backgrounds, borders, status colors
- **Spacing**: xs, sm, md, lg, xl, 2xl, 3xl (for margins, paddings)
- **Typography**: Font sizes (xs through 3xl), font weights (normal, medium, semibold, bold)
- **Border Radius**: sm, md, lg (for rounded corners)
- **Shadows**: sm, md, lg (for depth and elevation)
- **Transitions**: fast, normal, slow (for animations)
- **Z-indexes**: For layering components (header, modal, debug panel, etc.)

**Example Variables**:

```css
:root {
  --primary-gradient-start: #667eea;
  --primary-gradient-end: #764ba2;
  --text-primary: #333333;
  --bg-primary: #ffffff;
  --spacing-lg: 16px;
  --radius-md: 8px;
  --transition-fast: 0.2s ease;
}
```

### **Styling Implementation**

All frontend styles use CSS variables for:

- **Login.css** - Authentication page styles
- **Header.css** - Application header with user info and logout
- **ThemeSwitcher.css** - Theme selection dropdown styles

**Benefits**:
✅ Change entire color scheme in seconds by editing `variables.css`  
✅ Consistent spacing and typography across the app  
✅ Easy to implement multiple themes/brands  
✅ Responsive design using variable breakpoints  
✅ Maintainable and scalable styling approach

### **Customization Workflow**

To change the app's appearance:

1. Open `src/styles/variables.css`
2. Update color values in the `:root` block
3. All components automatically reflect changes
4. No need to edit individual CSS files

---

## 🚀 **Key Features Implemented**

### **Frontend Features**

- ✅ Beautiful login page with gradient design
- ✅ Global authentication context
- ✅ Protected routes with RBAC support
- ✅ Automatic JWT token injection in API calls
- ✅ User profile display (username + roles) in header
- ✅ Logout functionality with redirect
- ✅ Session expiration handling (401 auto-redirect)
- ✅ Responsive design (mobile-friendly)
- ✅ Error handling with user feedback
- ✅ Debug panel for troubleshooting

### **Backend Features**

- ✅ JWT-based authentication
- ✅ Password hashing with bcrypt
- ✅ Role-based access control (RBAC) ready
- ✅ CORS enabled for frontend communication
- ✅ API documentation (Swagger UI at `/docs`)
- ✅ Database migrations with Alembic
- ✅ Pydantic validation for all requests
- ✅ SQLAlchemy ORM for type-safe database access
- ✅ Global error handling with HTTPException
- ✅ User activity tracking (last_login)

---

## 🔌 **API Endpoints Currently Set Up**

```
# Authentication
POST   /api/auth/login                    # User login

# Users (example routers)
GET    /api/users/                        # List users
POST   /api/users/                        # Create user
GET    /api/users/{user_id}              # Get user
PUT    /api/users/{user_id}              # Update user

# Employees
GET    /api/employees/                    # List employees
POST   /api/employees/                    # Create employee
GET    /api/employees/{emp_id}           # Get employee
PUT    /api/employees/{emp_id}           # Update employee

# (15+ more domain routers available)
```

---

## 📊 **Technology Comparison**

| Aspect         | Frontend                 | Backend                   |
| -------------- | ------------------------ | ------------------------- |
| **Language**   | TypeScript               | Python                    |
| **Runtime**    | Browser (Node.js in dev) | Python 3.13+              |
| **Framework**  | React 19                 | FastAPI                   |
| **State**      | React Context            | Not needed (stateless)    |
| **Database**   | N/A                      | PostgreSQL + SQLAlchemy   |
| **HTTP**       | Axios                    | FastAPI (built-in)        |
| **Auth**       | JWT storage + Context    | JWT creation + validation |
| **Validation** | Pydantic (via backend)   | Pydantic schemas          |

---

## 🛡️ **Security Features**

- ✅ **JWT Tokens**: Stateless authentication, no session server needed
- ✅ **Password Hashing**: Bcrypt with pbkdf2_sha256 (one-way hashing)
- ✅ **CORS Validation**: Only allow localhost:5173 frontend
- ✅ **HTTPS Ready**: Can be deployed with SSL/TLS
- ✅ **Protected Routes**: Frontend redirects unauthorized users
- ✅ **Role-Based Access**: Backend can enforce permissions
- ⚠️ **Token Expiration**: Currently not implemented (can be added)
- ⚠️ **HTTPS Only**: Recommended for production

---

## 🎯 **Development Workflow**

### **Start App:**

```bash
cd rms-next
npm install
npm run dev
```

### **Access Application:**

- App: `http://localhost:3000`

### **Database migrations (Drizzle)**

```bash
cd rms-next
# Generate migration files from `src/lib/db/schema.ts`
npm run db:generate
# Apply migrations to the database
npm run db:migrate
```

---

## 📈 **Scalability & Future Enhancements**

### **Short Term**

- [ ] Add token refresh mechanism
- [ ] Implement 2FA/MFA
- [ ] Add rate limiting on login endpoint
- [ ] Implement request logging/audit trails
- [ ] Add comprehensive error handling

### **Medium Term**

- [ ] Add more API endpoints for business logic
- [ ] Implement WebSocket for real-time updates
- [ ] Add file upload/download functionality
- [ ] Create comprehensive API test suite
- [ ] Add API versioning (/api/v2/)

### **Long Term**

- [ ] Microservices architecture
- [ ] GraphQL API option
- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard
- [ ] Machine learning features

---

## 📋 **Summary**

This is a **production-ready authentication system** with:

- Modern React frontend with TypeScript
- Robust FastAPI backend with PostgreSQL
- JWT-based stateless authentication
- Role-based access control support
- Clean, modular architecture
- Responsive, user-friendly UI

The system is ready for integrating additional business features and can scale to handle enterprise-level requirements.
