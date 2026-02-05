from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.auth import User
from utils.dependencies import require_any_role
from db.models.requisition_item import RequisitionItem
from db.models.requisition import Requisition
from db.models.requisition_status_history import RequisitionStatusHistory
from db.models.employee import Employee
from schemas.requisition_item import (
    RequisitionItemCreate,
    AssignEmployeeRequest,
    UpdateItemStatusRequest,
    RequisitionItemResponse,
)

router = APIRouter(
    prefix="/requisitions",
    tags=["Requisition Items"]
)


def _record_status_history(
    db: Session,
    req_id: int,
    old_status: str | None,
    new_status: str | None,
    changed_by: int | None = None,
) -> None:
    if not new_status or new_status == old_status:
        return
    history = RequisitionStatusHistory(
        req_id=req_id,
        old_status=old_status,
        new_status=new_status,
        changed_by=changed_by,
    )
    db.add(history)


def recalculate_requisition_status(
    db: Session,
    req_id: int,
    changed_by: int | None = None,
) -> None:
    requisition = (
        db.query(Requisition)
        .filter(Requisition.req_id == req_id)
        .with_for_update()
        .first()
    )

    if not requisition:
        return

    db.flush()

    open_like_statuses = [
        "Open",
        "In Progress",
        "Pending",
        "Sourcing",
        "Shortlisted",
    ]

    counts = (
        db.query(
            func.count(RequisitionItem.item_id).label("total"),
            func.coalesce(
                func.sum(
                    case(
                        (RequisitionItem.item_status == "Fulfilled", 1),
                        else_=0,
                    )
                ),
                0,
            ).label("fulfilled"),
            func.coalesce(
                func.sum(
                    case(
                        (RequisitionItem.item_status == "Cancelled", 1),
                        else_=0,
                    )
                ),
                0,
            ).label("cancelled"),
            func.coalesce(
                func.sum(
                    case(
                        (RequisitionItem.item_status.in_(open_like_statuses), 1),
                        else_=0,
                    )
                ),
                0,
            ).label("open_like"),
        )
        .filter(RequisitionItem.req_id == req_id)
        .one()
    )

    total_count = int(counts.total or 0)
    if total_count == 0:
        return

    fulfilled_count = int(counts.fulfilled or 0)
    cancelled_count = int(counts.cancelled or 0)
    open_like_count = int(counts.open_like or 0)

    old_status = requisition.overall_status
    new_status = old_status

    if open_like_count > 0:
        new_status = "Active"
    elif fulfilled_count == total_count:
        new_status = "Fulfilled"
    elif cancelled_count == total_count:
        new_status = "Closed"
    elif fulfilled_count + cancelled_count == total_count:
        new_status = "Closed (Partially Fulfilled)"

    if new_status != old_status:
        requisition.overall_status = new_status
        _record_status_history(db, req_id, old_status, new_status, changed_by)

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
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    item = RequisitionItem(
        req_id=req_id,
        role_position=payload.role_position,
        job_description=payload.job_description,
        skill_level=payload.skill_level,
        experience_years=payload.experience_years,
        education_requirement=payload.education_requirement,
        requirements=payload.requirements,
        item_status="Pending",
    )

    db.add(item)
    db.flush()
    recalculate_requisition_status(db, req_id, current_user.user_id)
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
    item = db.query(RequisitionItem).filter(
        RequisitionItem.item_id == item_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if item.item_status == "Fulfilled":
        raise HTTPException(
            status_code=400,
            detail="Item already fulfilled"
        )

    employee = db.query(Employee).filter(
        Employee.emp_id == payload.emp_id
    ).first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    existing_assignment = (
        db.query(RequisitionItem)
        .filter(
            RequisitionItem.assigned_emp_id == payload.emp_id,
            RequisitionItem.item_status == "Fulfilled",
            RequisitionItem.item_id != item_id,
        )
        .first()
    )

    if existing_assignment:
        raise HTTPException(
            status_code=400,
            detail="Employee already assigned to another fulfilled item"
        )

    item.assigned_emp_id = payload.emp_id
    item.item_status = "Fulfilled"

    recalculate_requisition_status(db, item.req_id, current_user.user_id)

    db.commit()
    db.refresh(item)

    return {"message": "Employee assigned successfully"}

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
    if payload.status not in (
        "Pending",
        "Sourcing",
        "Shortlisted",
        "Fulfilled",
        "Cancelled",
    ):
        raise HTTPException(status_code=400, detail="Invalid status")

    item = db.query(RequisitionItem).filter(
        RequisitionItem.item_id == item_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    item.item_status = payload.status

    recalculate_requisition_status(db, item.req_id, current_user.user_id)

    db.commit()
    db.refresh(item)

    return {"message": "Item status updated"}
