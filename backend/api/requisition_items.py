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

# Workflow engine imports (V2 - migrated from legacy engine per F-001 remediation)
from services.requisition.workflow_engine_v2 import (
    RequisitionWorkflowEngine,
    RequisitionItemWorkflowEngine,
)
from services.requisition.events import RequisitionEvents
from services.requisition.workflow_exceptions import (
    WorkflowException,
    EntityLockedException,
)
from services.requisition.workflow_matrix import ITEM_MODIFICATION_BLOCKED_HEADER_STATES

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
    from services.requisition.workflow_matrix import RequisitionStatus
    
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    # V2 validation: Check if header state allows item creation
    # Items can only be created when header is in Draft, Pending Budget, Pending HR, or Active
    try:
        current_status = RequisitionStatus(requisition.overall_status)
        if current_status in ITEM_MODIFICATION_BLOCKED_HEADER_STATES:
            raise EntityLockedException(
                entity_type="requisition",
                entity_id=req_id,
                reason=f"Cannot add items when requisition is in '{requisition.overall_status}' status"
            )
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid requisition status: {requisition.overall_status}")

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

    if payload.replacement_hire and payload.replaced_emp_id:
        replaced_employee = db.query(Employee).filter(
            Employee.emp_id == payload.replaced_emp_id
        ).first()
        if not replaced_employee:
            raise HTTPException(
                status_code=400,
                detail=f"Employee '{payload.replaced_emp_id}' not found for replacement",
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

    RequisitionEvents.log_audit(
        db=db,
        entity_name="requisition_item",
        entity_id=str(item.item_id),
        action="ITEM_CREATED",
        performed_by=current_user.user_id,
        new_value={
            "req_id": req_id,
            "role_position": item.role_position,
            "item_status": item.item_status,
            "replacement_hire": item.replacement_hire,
            "replaced_emp_id": item.replaced_emp_id,
        },
    )

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
    """
    Assign an employee to a requisition item.
    
    DEPRECATED: Use POST /api/requisition-items/{item_id}/workflow/fulfill instead.
    This endpoint is maintained for backward compatibility only.
    """
    from utils.dependencies import get_current_user_roles
    roles = get_current_user_roles(current_user)
    
    try:
        RequisitionItemWorkflowEngine.fulfill(
            db=db,
            item_id=item_id,
            user_id=current_user.user_id,
            user_roles=roles,
            employee_id=payload.emp_id,
        )
        db.commit()
        return {"message": "Employee assigned successfully"}
    except WorkflowException as e:
        db.rollback()
        raise HTTPException(status_code=e.http_status, detail=e.message)

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
    """
    Update the status of a requisition item.
    
    DEPRECATED: Use the workflow endpoints instead:
    - POST /api/requisition-items/{item_id}/workflow/shortlist
    - POST /api/requisition-items/{item_id}/workflow/interview
    - POST /api/requisition-items/{item_id}/workflow/offer
    - POST /api/requisition-items/{item_id}/workflow/fulfill
    - POST /api/requisition-items/{item_id}/workflow/cancel
    
    Direct status modification is disabled per GC-001.
    """
    raise HTTPException(
        status_code=403,
        detail="Direct status modification is disabled. Use workflow endpoints: "
               "/api/requisition-items/{item_id}/workflow/{action}"
    )
