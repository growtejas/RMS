from sqlalchemy import Column, Integer, String
from db.base import Base


class Skill(Base):
    __tablename__ = "skills"

    skill_id = Column(Integer, primary_key=True)
    skill_name = Column(String(50), nullable=False, unique=True)
