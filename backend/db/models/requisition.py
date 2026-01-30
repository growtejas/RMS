from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Date,
    Boolean,
    Numeric,
    TIMESTAMP,
    CheckConstraint,
    ForeignKey
)
from sqlalchemy.sql import func
from db.base import Base


class Requisition(Base):
    __tablename__ = "requisitions"

    # --------------------
    # Primary Key
    # --------------------
    req_id = Column(Integer, primary_key=True)

    # --------------------
    # Ownership
    # --------------------
    raised_by = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=False
    )

    assigned_ta = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=True
    )

    budget_approved_by = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=True
    )

    # --------------------
    # Business Context
    # --------------------
    project_name = Column(String(100), nullable=True)
    client_name = Column(String(100), nullable=True)
    justification = Column(Text, nullable=True)
    manager_notes = Column(Text, nullable=True)

    # --------------------
    # Request Details
    # --------------------
    priority = Column(String(10), nullable=True)
    is_replacement = Column(Boolean, default=False)
    duration = Column(String(50), nullable=True)

    work_mode = Column(String(10), nullable=True)
    office_location = Column(String(100), nullable=True)

    # --------------------
    # Budget & Timeline
    # --------------------
    budget_amount = Column(Numeric(12, 2), nullable=True)
    required_by_date = Column(Date, nullable=True)

    # --------------------
    # Workflow
    # --------------------
    overall_status = Column(
        String(30),
        nullable=False,
        default="Pending Budget"
    )

    date_closed = Column(TIMESTAMP, nullable=True)

    # --------------------
    # Audit
    # --------------------
    created_at = Column(
        TIMESTAMP,
        server_default=func.now(),
        nullable=False
    )

    # --------------------
    # Constraints
    # --------------------
    __table_args__ = (
        CheckConstraint(
            "priority IN ('High', 'Medium', 'Low')",
            name="chk_requisition_priority"
        ),
        CheckConstraint(
            """
            overall_status IN (
                'Pending Budget',
                'Pending HR',
                'Approved & Unassigned',
                'Active',
                'Closed',
                'Expired'
            )
            """,
            name="chk_requisition_status"
        ),
    )
