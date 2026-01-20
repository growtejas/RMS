from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from db.models.skill import Skill
from schemas.skill import SkillCreate, SkillResponse

router = APIRouter(prefix="/skills", tags=["Skills"])
