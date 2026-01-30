from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class RequisitionCreate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    justification: Optional[str] = None
    manager_notes: Optional[str] = None
    priority: Optional[str] = None
    is_replacement: Optional[bool] = None
    duration: Optional[str] = None
    work_mode: Optional[str] = None
    office_location: Optional[str] = None
    budget_amount: Optional[float] = None
    required_by_date: Optional[date] = None
    date_closed: Optional[datetime] = None


class RequisitionUpdate(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    justification: Optional[str] = None
    manager_notes: Optional[str] = None
    priority: Optional[str] = None
    is_replacement: Optional[bool] = None
    duration: Optional[str] = None
    work_mode: Optional[str] = None
    office_location: Optional[str] = None
    budget_amount: Optional[float] = None
    required_by_date: Optional[date] = None
    date_closed: Optional[datetime] = None
    assigned_ta: Optional[int] = None
    budget_approved_by: Optional[int] = None


class RequisitionStatusUpdate(BaseModel):
    overall_status: str
