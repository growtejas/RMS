from fastapi import FastAPI

from api.users import router as users_router

app = FastAPI(title="RBM Resource Fulfillment Module")

app.include_router(users_router)    


