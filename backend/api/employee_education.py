from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from db.models.employee_education import EmployeeEducation
from schemas.employee_education import (
    EmployeeEducationCreate,
    EmployeeEducationResponse
)

router = APIRouter(
    prefix="/employees/{emp_id}/education",
    tags=["Employee Education"]
)
@router.post("/", response_model=EmployeeEducationResponse)
def add_education(
    emp_id: str,
    payload: EmployeeEducationCreate,
    db: Session = Depends(get_db)
):
    record = EmployeeEducation(emp_id=emp_id, **payload.dict())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
@router.get("/", response_model=list[EmployeeEducationResponse])
def list_education(emp_id: str, db: Session = Depends(get_db)):
    return (
        db.query(EmployeeEducation)
        .filter(EmployeeEducation.emp_id == emp_id)
        .order_by(EmployeeEducation.year_completed.desc())
        .all()
    )
