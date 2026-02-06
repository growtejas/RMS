from sqlalchemy import (
    Boolean,
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
    """
    Requisition Item Model
    
    RBM Resource Fulfillment Module — Workflow Specification v1.0.0
    
    Status Values (Section 4.1):
    - Pending: Item created, awaiting TA assignment
    - Sourcing: TA assigned, candidate search in progress
    - Shortlisted: Candidates identified for review
    - Interviewing: Interview process active
    - Offered: Offer extended to candidate
    - Fulfilled: Position filled, employee assigned (Terminal)
    - Cancelled: Item cancelled (Terminal)
    """
    __tablename__ = "requisition_items"

    # --------------------
    # Primary Key
    # --------------------
    item_id = Column(Integer, primary_key=True)

    # --------------------
    # Optimistic Locking
    # --------------------
    version = Column(Integer, nullable=False, default=1, server_default='1')

    # --------------------
    # Parent Requisition
    # --------------------
    req_id = Column(
        Integer,
        ForeignKey("requisitions.req_id", ondelete="RESTRICT"),
        nullable=False,
        index=True
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
        ForeignKey("employees.emp_id", ondelete="RESTRICT"),
        nullable=True
    )

    replacement_hire = Column(
        Boolean,
        nullable=False,
        default=False
    )

    replaced_emp_id = Column(
        String(20),
        ForeignKey("employees.emp_id", ondelete="RESTRICT"),
        nullable=True
    )

    # Item-level TA assignment (GC-003: triggers PENDING → SOURCING)
    # Note: Column is named 'assigned_ta' in DB to match header-level convention
    assigned_ta = Column(
        "assigned_ta",  # Explicit DB column name
        Integer,
        ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=True,
        index=True
    )

    # --------------------
    # Notes
    # --------------------
    hr_notes = Column(Text, nullable=True)
    ta_notes = Column(Text, nullable=True)

    # --------------------
    # Workflow (Specification v1.0.0)
    # --------------------
    item_status = Column(
        String(20),
        nullable=False,
        default="Pending",
        index=True
    )

    # --------------------
    # Constraints (Specification v1.0.0)
    # --------------------
    __table_args__ = (
        CheckConstraint(
            """
            item_status IN (
                'Pending',
                'Sourcing',
                'Shortlisted',
                'Interviewing',
                'Offered',
                'Fulfilled',
                'Cancelled'
            )
            """,
            name="chk_requisition_item_status"
        ),
        # GC-004: FULFILLED items must have employee assigned
        CheckConstraint(
            "item_status != 'Fulfilled' OR assigned_emp_id IS NOT NULL",
            name="chk_fulfilled_has_employee"
        ),
    )
