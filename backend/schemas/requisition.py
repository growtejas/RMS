from pydantic import BaseModel
from typing import Optional
from datetime import date


class RequisitionCreate(BaseModel):
    client_name: Optional[str] = None
    justification: Optional[str] = None
    priority: Optional[str] = None
    budget: Optional[float] = None
    required_by: Optional[date] = None


class RequisitionUpdate(BaseModel):
    client_name: Optional[str] = None
    justification: Optional[str] = None
    priority: Optional[str] = None
    budget: Optional[float] = None
    required_by: Optional[date] = None


class RequisitionStatusUpdate(BaseModel):
    status: str
