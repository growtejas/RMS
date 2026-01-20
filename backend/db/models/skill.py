from sqlalchemy import Column, Integer, String
from db.base import Base


class Skill(Base):
    __tablename__ = "skills"

    skill_id = Column(Integer, primary_key=True, index=True)
    skill_name = Column(String(50), unique=True, nullable=False)
