from pydantic import BaseModel
from typing import Optional


class RequisitionItemCreate(BaseModel):
    role_position: str
    job_description: str
    skill_level: Optional[str] = None
    experience_years: Optional[int] = None
    education_requirement: Optional[str] = None
    requirements: Optional[str] = None


class AssignEmployeeRequest(BaseModel):
    emp_id: str


class UpdateItemStatusRequest(BaseModel):
    status: str
