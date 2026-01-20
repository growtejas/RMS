from sqlalchemy import Column, String, LargeBinary, ForeignKey
from db.base import Base


class EmployeeFinance(Base):
    __tablename__ = "employee_finance"

    emp_id = Column(
        String(20),
        ForeignKey("employees.emp_id"),
        primary_key=True
    )

    bank_details_encrypted = Column(LargeBinary, nullable=True)
    tax_id = Column(String(50), nullable=True)
