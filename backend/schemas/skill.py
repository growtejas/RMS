from pydantic import BaseModel


class SkillCreate(BaseModel):
    skill_name: str


class SkillResponse(BaseModel):
    skill_id: int
    skill_name: str

    class Config:
        from_attributes = True



