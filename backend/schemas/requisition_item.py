from pydantic import BaseModel
from typing import Optional


class RequisitionItemCreate(BaseModel):
    skill_id: Optional[int] = None
    required_level: Optional[str] = None
    education_requirement: Optional[str] = None


class AssignEmployeeRequest(BaseModel):
    emp_id: str


class UpdateItemStatusRequest(BaseModel):
    status: str
