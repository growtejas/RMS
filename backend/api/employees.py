from db.models.user_employee_map import UserEmployeeMap

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.auth import User
from utils.dependencies import require_any_role

from db.models.employee import Employee
from db.models.employee_skill import EmployeeSkill
from schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeStatusUpdate,
    EmployeeResponse
)

router = APIRouter(prefix="/employees", tags=["Employees"])
# API 1 — Create Employee
@router.post("/", response_model=EmployeeResponse)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin"))
):
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
        doj=payload.doj,
        emp_status="Onboarding"  # Start onboarding when employee is created
    )

    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee
# API 2 — List All Employees
@router.get("/employees")
def list_employees(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin", "Manager", "Employee"))
):
    results = (
        db.query(Employee, UserEmployeeMap.user_id)
        .outerjoin(UserEmployeeMap)
        .all()
    )

    response = []
    for emp, user_id in results:
        response.append({
            "emp_id": emp.emp_id,
            "full_name": emp.full_name,
            "user_id": user_id
        })

    return response

# API 3 — Get Employee by ID
@router.get("/{emp_id}", response_model=EmployeeResponse)
def get_employee(
    emp_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin", "Manager", "Employee"))
):
    employee = db.query(Employee).filter(Employee.emp_id == emp_id).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    return employee
    # API 4 — Update Employee Basic Info
@router.patch("/{emp_id}", response_model=EmployeeResponse)
def update_employee(
    emp_id: str,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin"))
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
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin"))
):
    employee = db.query(Employee).filter(Employee.emp_id == emp_id).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    employee.emp_status = payload.emp_status
    db.commit()
    db.refresh(employee)
    return employee

# API 6 — Complete Onboarding
@router.post("/{emp_id}/complete-onboarding", response_model=EmployeeResponse)
def complete_onboarding(
    emp_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin"))
):
    """
    Complete employee onboarding by validating prerequisites and marking employee as Active.
    
    Prerequisites:
    - Employee profile must exist
    - Employee status must be "Onboarding"
    - At least one skill must be added
    """
    # 1. Check employee exists
    employee = db.query(Employee).filter(Employee.emp_id == emp_id).first()
    
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    
    # 2. Check employee is in Onboarding status
    if employee.emp_status != "Onboarding":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot complete onboarding. Employee status is '{employee.emp_status}'. Only employees with status 'Onboarding' can complete onboarding."
        )
    
    # 3. Check at least one skill exists
    skill_count = db.query(EmployeeSkill).filter(
        EmployeeSkill.emp_id == emp_id
    ).count()
    
    if skill_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot complete onboarding. At least one skill must be added to the employee profile."
        )
    
    # 4. Update status to Active
    employee.emp_status = "Active"
    db.commit()
    db.refresh(employee)
    
    return employee
