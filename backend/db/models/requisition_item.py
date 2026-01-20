from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    CheckConstraint
)
from db.base import Base


class RequisitionItem(Base):
    __tablename__ = "requisition_items"

    item_id = Column(Integer, primary_key=True)

    req_id = Column(
        Integer,
        ForeignKey("requisitions.req_id", ondelete="CASCADE"),
        nullable=False
    )

    skill_id = Column(
        Integer,
        ForeignKey("skills.skill_id"),
        nullable=True
    )

    required_level = Column(String(20), nullable=True)
    education_requirement = Column(String(100), nullable=True)

    assigned_emp_id = Column(
        String(20),
        ForeignKey("employees.emp_id"),
        nullable=True
    )

    item_status = Column(String(20), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "item_status IN ('Pending', 'Fulfilled', 'Cancelled')",
            name="chk_requisition_item_status"
        ),
    )
