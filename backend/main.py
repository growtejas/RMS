from dotenv import load_dotenv
import os

load_dotenv()

from fastapi import FastAPI
from fastapi import FastAPI

# ---- Create app ----
app = FastAPI(title="RBM Resource Fulfillment Module")

# ---- Core APIs ----
from api.users import router as users_router
from api.employees import router as employees_router
from api.org import router as org_router

# ---- Employee-related ----
from api.employee_contacts import router as employee_contacts_router
from api.employee_finance import router as employee_finance_router
from api.employee_availability import router as employee_availability_router

# ---- Skills & Education ----
from api.skills import router as skills_router
from api.employee_skills import router as employee_skills_router
from api.employee_education import router as employee_education_router

# ---- Requisitions ----
from api.requisitions import router as requisitions_router
from api.requisition_items import router as requisition_items_router
from api.requisition_status_history import router as requisition_status_history_router

# ---- Audit ----
from api.audit_log import router as audit_log_router

# ---- HR ----
from api.hr import router as hr_router

# ---- Authentication ----
from api.auth import router as auth_router


# ---- Include routers (EACH EXACTLY ONCE) ----
app.include_router(users_router)
app.include_router(employees_router)
app.include_router(org_router)

app.include_router(employee_contacts_router)
app.include_router(employee_finance_router)
app.include_router(employee_availability_router)

app.include_router(skills_router)
app.include_router(employee_skills_router)
app.include_router(employee_education_router)

app.include_router(requisitions_router)
app.include_router(requisition_items_router)
app.include_router(requisition_status_history_router)

app.include_router(audit_log_router)
app.include_router(hr_router)
app.include_router(auth_router)

