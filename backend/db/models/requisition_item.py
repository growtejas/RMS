from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    ForeignKey,
    CheckConstraint
)
from sqlalchemy.orm import relationship
from db.base import Base


class RequisitionItem(Base):
    __tablename__ = "requisition_items"

    # --------------------
    # Primary Key
    # --------------------
    item_id = Column(Integer, primary_key=True)

    # --------------------
    # Parent Requisition
    # --------------------
    req_id = Column(
        Integer,
        ForeignKey("requisitions.req_id", ondelete="CASCADE"),
        nullable=False
    )

    # --------------------
    # Relationships
    # --------------------
    requisition = relationship("Requisition", back_populates="items")

    # --------------------
    # Position Details
    # --------------------
    role_position = Column(String(50), nullable=False)
    job_description = Column(Text, nullable=False)

    skill_level = Column(String(30), nullable=True)
    experience_years = Column(Integer, nullable=True)

    education_requirement = Column(String(100), nullable=True)
    requirements = Column(Text, nullable=True)

    # --------------------
    # Assignment
    # --------------------
    assigned_emp_id = Column(
        String(20),
        ForeignKey("employees.emp_id"),
        nullable=True
    )

    # --------------------
    # Notes
    # --------------------
    hr_notes = Column(Text, nullable=True)
    ta_notes = Column(Text, nullable=True)

    # --------------------
    # Workflow
    # --------------------
    item_status = Column(
        String(20),
        nullable=False,
        default="Pending"
    )

    # --------------------
    # Constraints
    # --------------------
    __table_args__ = (
        CheckConstraint(
            """
            item_status IN (
                'Pending',
                'Sourcing',
                'Shortlisted',
                'Fulfilled',
                'Cancelled'
            )
            """,
            name="chk_requisition_item_status"
        ),
    )
