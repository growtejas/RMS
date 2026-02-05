from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.auth import User
from utils.dependencies import require_any_role
from db.models.requisition_item import RequisitionItem
from db.models.requisition import Requisition
from db.models.employee import Employee
from schemas.requisition_item import (
    RequisitionItemCreate,
    AssignEmployeeRequest,
    UpdateItemStatusRequest,
    RequisitionItemResponse,
)

# Workflow engine imports
from services.requisition import RequisitionWorkflowEngine
from services.requisition.events import RequisitionEvents
from services.requisition.workflow_engine import WorkflowError

router = APIRouter(
    prefix="/requisitions",
    tags=["Requisition Items"]
)


# --------------------------------------------------
# CREATE REQUISITION ITEM
# --------------------------------------------------
@router.post("/{req_id}/items", response_model=RequisitionItemResponse)
def create_requisition_item(
    req_id: int,
    payload: RequisitionItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR"))
):
    """Create a new item for a requisition."""
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    # Use workflow engine for validation
    try:
        RequisitionWorkflowEngine.validate_can_create_item(db, requisition)
    except WorkflowError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)

    if payload.replacement_hire and not payload.replaced_emp_id:
        raise HTTPException(
            status_code=400,
            detail="replaced_emp_id is required when replacement_hire is true",
        )

    if not payload.replacement_hire and payload.replaced_emp_id:
        raise HTTPException(
            status_code=400,
            detail="replaced_emp_id must be null when replacement_hire is false",
        )

    item = RequisitionItem(
        req_id=req_id,
        role_position=payload.role_position,
        job_description=payload.job_description,
        skill_level=payload.skill_level,
        experience_years=payload.experience_years,
        education_requirement=payload.education_requirement,
        requirements=payload.requirements,
        item_status="Pending",
        replacement_hire=payload.replacement_hire,
        replaced_emp_id=payload.replaced_emp_id,
    )

    db.add(item)
    db.flush()

    if item.replacement_hire:
        RequisitionEvents.log_audit(
            db=db,
            entity_name="requisition_item",
            entity_id=str(item.item_id),
            action="REPLACEMENT_REQUESTED",
            performed_by=current_user.user_id,
            new_value={
                "replaced_emp_id": item.replaced_emp_id,
            },
        )
    
    # Use workflow engine for recalculation
    RequisitionWorkflowEngine.recalculate_header_status(db, req_id, current_user.user_id)
    
    db.commit()
    db.refresh(item)

    return item

# --------------------------------------------------
# LIST ITEMS FOR A REQUISITION
# --------------------------------------------------
@router.get("/{req_id}/items", response_model=list[RequisitionItemResponse])
def list_requisition_items(
    req_id: int,
    db: Session = Depends(get_db),
):
    """List all items for a requisition."""
    return (
        db.query(RequisitionItem)
        .filter(RequisitionItem.req_id == req_id)
        .all()
    )

# --------------------------------------------------
# ASSIGN EMPLOYEE TO ITEM
# --------------------------------------------------
@router.patch("/items/{item_id}/assign")
def assign_employee_to_item(
    item_id: int,
    payload: AssignEmployeeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "TA")),
):
    """Assign an employee to a requisition item."""
    # Issue 4 fix: Add row-level locking to prevent race conditions
    item = db.query(RequisitionItem).filter(
        RequisitionItem.item_id == item_id
    ).with_for_update().first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    try:
        RequisitionWorkflowEngine.assign_employee_to_item(
            db=db,
            item=item,
            emp_id=payload.emp_id,
            performed_by=current_user.user_id,
        )
        db.commit()
        db.refresh(item)
        return {"message": "Employee assigned successfully"}
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)

# --------------------------------------------------
# UPDATE ITEM STATUS
# --------------------------------------------------
@router.patch("/items/{item_id}/status")
def update_item_status(
    item_id: int,
    payload: UpdateItemStatusRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "TA")),
):
    """Update the status of a requisition item."""
    item = db.query(RequisitionItem).filter(
        RequisitionItem.item_id == item_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    try:
        RequisitionWorkflowEngine.update_item_status(
            db=db,
            item=item,
            new_status=payload.status,
            performed_by=current_user.user_id,
        )
        db.commit()
        db.refresh(item)
        return {"message": "Item status updated"}
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
