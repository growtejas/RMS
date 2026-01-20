# .\venv\Scripts\python.exe -m uvicorn main:app --reload
from fastapi import FastAPI

from api.users import router as users_router

app = FastAPI(title="RBM Resource Fulfillment Module")

app.include_router(users_router)    


from api.employees import router as employees_router

app.include_router(employees_router)
