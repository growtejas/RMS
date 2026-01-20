from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from db.models.employee_skill import EmployeeSkill
from db.models.employee import Employee
from db.models.skill import Skill
from schemas.employee_skill import (
    EmployeeSkillUpsert,
    EmployeeSkillResponse
)

router = APIRouter(
    prefix="/employees/{emp_id}/skills",
    tags=["Employee Skills"]
)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from db.models.employee_skill import EmployeeSkill
from db.models.employee import Employee
from db.models.skill import Skill
from schemas.employee_skill import (
    EmployeeSkillUpsert,
    EmployeeSkillResponse
)

router = APIRouter(
    prefix="/employees/{emp_id}/skills",
    tags=["Employee Skills"]
)

@router.get("/", response_model=list[EmployeeSkillResponse])
def list_employee_skills(emp_id: str, db: Session = Depends(get_db)):
    return (
        db.query(EmployeeSkill)
        .filter(EmployeeSkill.emp_id == emp_id)
        .all()
    )
@router.delete("/{skill_id}")
def delete_employee_skill(emp_id: str, skill_id: int, db: Session = Depends(get_db)):
    record = (
        db.query(EmployeeSkill)
        .filter(
            EmployeeSkill.emp_id == emp_id,
            EmployeeSkill.skill_id == skill_id
        )
        .first()
    )

    if not record:
        raise HTTPException(status_code=404, detail="Skill not assigned")

    db.delete(record)
    db.commit()

    return {"message": "Skill removed from employee"}

