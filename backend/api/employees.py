from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db

from db.models.employee import Employee
from schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeStatusUpdate,
    EmployeeResponse
)

router = APIRouter(prefix="/employees", tags=["Employees"])
# API 1 — Create Employee
@router.post("/", response_model=EmployeeResponse)
def create_employee(payload: EmployeeCreate, db: Session = Depends(get_db)):
    existing = db.query(Employee).filter(
        Employee.emp_id == payload.emp_id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Employee already exists")

    employee = Employee(
        emp_id=payload.emp_id,
        full_name=payload.full_name,
        rbm_email=payload.rbm_email,
        dob=payload.dob,
        gender=payload.gender,
        doj=payload.doj
    )

    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee
# API 2 — List All Employees
@router.get("/", response_model=list[EmployeeResponse])
def list_employees(db: Session = Depends(get_db)):
    return db.query(Employee).all()
# API 3 — Get Employee by ID
@router.get("/{emp_id}", response_model=EmployeeResponse)
def get_employee(emp_id: str, db: Session = Depends(get_db)):
    employee = db.query(Employee).filter(Employee.emp_id == emp_id).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    return employee
    # API 4 — Update Employee Basic Info
@router.patch("/{emp_id}", response_model=EmployeeResponse)
def update_employee(
    emp_id: str,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db)
):
    employee = db.query(Employee).filter(Employee.emp_id == emp_id).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employee, field, value)

    db.commit()
    db.refresh(employee)
    return employee
# API 5 — Change Employee Status
@router.patch("/{emp_id}/status", response_model=EmployeeResponse)
def update_employee_status(
    emp_id: str,
    payload: EmployeeStatusUpdate,
    db: Session = Depends(get_db)
):
    employee = db.query(Employee).filter(Employee.emp_id == emp_id).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.emp_status = payload.emp_status
    db.commit()
    db.refresh(employee)
    return employee
