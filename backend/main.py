# .\venv\Scripts\python.exe -m uvicorn main:app --reload
from fastapi import FastAPI

from api.users import router as users_router
from api.employees import router as employees_router
from api.org import router as org_router

app = FastAPI(title="RBM Resource Fulfillment Module")

from api.employee_contacts import router as employee_contacts_router

app.include_router(employee_contacts_router)

app.include_router(users_router)
app.include_router(employees_router)
app.include_router(org_router)