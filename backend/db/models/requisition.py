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

    req_id = Column(Integer, primary_key=True)

    raised_by = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=True
    )

    approved_by = Column(
        Integer,
        ForeignKey("users.user_id"),
        nullable=True
    )

    client_name = Column(String(100), nullable=True)
    justification = Column(Text, nullable=True)

    priority = Column(String(10), nullable=True)
    budget = Column(Numeric(12, 2), nullable=True)
    budget_approved = Column(Boolean, default=False)

    required_by = Column(Date, nullable=True)
    status = Column(String(20), nullable=True)

    created_at = Column(
        TIMESTAMP,
        server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "priority IN ('High', 'Medium', 'Low')",
            name="chk_requisition_priority"
        ),
        CheckConstraint(
            "status IN ('Open', 'In Progress', 'Closed', 'Cancelled')",
            name="chk_requisition_status"
        ),
    )
