from pydantic import BaseModel, Field, constr, condecimal
from typing import Optional, List
from datetime import date, datetime
from schemas.requisition_item import RequisitionItemCreate, RequisitionItemResponse


class RequisitionCreate(BaseModel):
    project_name: Optional[constr(max_length=100)] = None
    client_name: Optional[constr(max_length=100)] = None
    office_location: Optional[constr(max_length=100)] = None
    work_mode: Optional[constr(max_length=10)] = None
    required_by_date: Optional[date] = None
    priority: Optional[constr(max_length=10)] = None
    justification: Optional[str] = None
    budget_amount: Optional[condecimal(max_digits=12, decimal_places=2)] = None
    duration: Optional[constr(max_length=50)] = None
    is_replacement: Optional[bool] = None
    manager_notes: Optional[str] = None
    date_closed: Optional[datetime] = None
    items: List[RequisitionItemCreate] = Field(default_factory=list)


class RequisitionUpdate(BaseModel):
    project_name: Optional[constr(max_length=100)] = None
    client_name: Optional[constr(max_length=100)] = None
    justification: Optional[str] = None
    manager_notes: Optional[str] = None
    priority: Optional[constr(max_length=10)] = None
    is_replacement: Optional[bool] = None
    duration: Optional[constr(max_length=50)] = None
    work_mode: Optional[constr(max_length=10)] = None
    office_location: Optional[constr(max_length=100)] = None
    budget_amount: Optional[condecimal(max_digits=12, decimal_places=2)] = None
    required_by_date: Optional[date] = None
    date_closed: Optional[datetime] = None
    assigned_ta: Optional[int] = None
    budget_approved_by: Optional[int] = None


class RequisitionStatusUpdate(BaseModel):
    overall_status: str


class RequisitionResponse(BaseModel):
    req_id: int
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    office_location: Optional[str] = None
    work_mode: Optional[str] = None
    required_by_date: Optional[date] = None
    priority: Optional[str] = None
    justification: Optional[str] = None
    budget_amount: Optional[condecimal(max_digits=12, decimal_places=2)] = None
    duration: Optional[str] = None
    is_replacement: Optional[bool] = None
    manager_notes: Optional[str] = None
    overall_status: str
    raised_by: int
    items: List[RequisitionItemResponse] = Field(default_factory=list)

    class Config:
        from_attributes = True
