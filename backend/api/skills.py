from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from db.models.skill import Skill
from schemas.skill import SkillCreate, SkillResponse

router = APIRouter(prefix="/skills", tags=["Skills"])

@router.post("/", response_model=SkillResponse)
def create_skill(payload: SkillCreate, db: Session = Depends(get_db)):
    existing = db.query(Skill).filter(Skill.skill_name == payload.skill_name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Skill already exists")

    skill = Skill(skill_name=payload.skill_name)
    db.add(skill)
    db.commit()
    db.refresh(skill)

    return skill
@router.get("/", response_model=list[SkillResponse])
def list_skills(db: Session = Depends(get_db)):
    return db.query(Skill).order_by(Skill.skill_name).all()
