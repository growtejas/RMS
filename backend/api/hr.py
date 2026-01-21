from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db

from db.models.employee import Employee
from db.models.employee_contact import EmployeeContact
from db.models.employee_skill import EmployeeSkill
from db.models.employee_education import EmployeeEducation
from db.models.employee_finance import EmployeeFinance

from schemas.hr_employee import HREmployeeProfile


router = APIRouter(prefix="/hr", tags=["HR"])


@router.get("/employees", response_model=list[HREmployeeProfile])
def hr_list_employee_profiles(db: Session = Depends(get_db)):
    employees = db.query(Employee).all()

    profiles: list[HREmployeeProfile] = []
    for emp in employees:
        contacts = db.query(EmployeeContact).filter_by(emp_id=emp.emp_id).all()
        skills = db.query(EmployeeSkill).filter_by(emp_id=emp.emp_id).all()
        education = db.query(EmployeeEducation).filter_by(emp_id=emp.emp_id).all()
        finance = db.query(EmployeeFinance).filter_by(emp_id=emp.emp_id).first()

        profiles.append(
            HREmployeeProfile(
                employee=emp,
                contacts=contacts,
                skills=skills,
                education=education,
                finance=finance,
            )
        )

    return profiles


@router.get("/employees/{emp_id}", response_model=HREmployeeProfile)
def hr_get_employee_profile(emp_id: str, db: Session = Depends(get_db)):
    emp = db.query(Employee).filter(Employee.emp_id == emp_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    contacts = db.query(EmployeeContact).filter_by(emp_id=emp.emp_id).all()
    skills = db.query(EmployeeSkill).filter_by(emp_id=emp.emp_id).all()
    education = db.query(EmployeeEducation).filter_by(emp_id=emp.emp_id).all()
    finance = db.query(EmployeeFinance).filter_by(emp_id=emp.emp_id).first()

    return HREmployeeProfile(
        employee=emp,
        contacts=contacts,
        skills=skills,
        education=education,
        finance=finance,
    )

