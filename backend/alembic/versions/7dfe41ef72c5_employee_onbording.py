"""employee onbording

Revision ID: 7dfe41ef72c5
Revises: cd89dff74b22
Create Date: 2026-01-22 09:40:35.487251

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# Alembic revision identifiers (MANDATORY)
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "75ce56ac4e23"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add 'Onboarding' status to employee status constraint and update default."""
    # Drop the old constraint
    op.drop_constraint("chk_emp_status", "employees", type_="check")
    
    # Create new constraint with 'Onboarding' included
    op.create_check_constraint(
        "chk_emp_status",
        "employees",
        "emp_status IN ('Onboarding', 'Active', 'On Leave', 'Exited')"
    )
    
    # Update default value to 'Onboarding' for new employees
    op.alter_column(
        "employees",
        "emp_status",
        server_default="Onboarding"
    )


def downgrade() -> None:
    """Revert to original constraint and default."""
    # Drop the new constraint
    op.drop_constraint("chk_emp_status", "employees", type_="check")
    
    # Restore original constraint
    op.create_check_constraint(
        "chk_emp_status",
        "employees",
        "emp_status IN ('Active', 'On Leave', 'Exited')"
    )
    
    # Restore original default
    op.alter_column(
        "employees",
        "emp_status",
        server_default="Active"
    )
