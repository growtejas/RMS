from pydantic import BaseModel, Field
from typing import Optional, Annotated


class RequisitionItemCreate(BaseModel):
    role_position: Annotated[str, Field(min_length=2, max_length=50)]
    job_description: Annotated[str, Field(min_length=5)]
    skill_level: Optional[Annotated[str, Field(max_length=30)]] = None
    experience_years: Optional[Annotated[int, Field(ge=0)]] = None
    education_requirement: Optional[Annotated[str, Field(max_length=100)]] = None
    requirements: Optional[str] = None


class RequisitionItemResponse(BaseModel):
    item_id: int
    req_id: int
    role_position: str
    skill_level: Optional[str] = None
    experience_years: Optional[int] = None
    education_requirement: Optional[str] = None
    job_description: str
    requirements: Optional[str] = None
    item_status: str

    class Config:
        from_attributes = True


class AssignEmployeeRequest(BaseModel):
    emp_id: str


class UpdateItemStatusRequest(BaseModel):
    status: str
