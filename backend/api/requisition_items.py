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
)

router = APIRouter(
    prefix="/requisitions",
    tags=["Requisition Items"]
)

# --------------------------------------------------
# CREATE REQUISITION ITEM
# --------------------------------------------------
@router.post("/{req_id}/items")
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
    db.commit()
    db.refresh(item)

    return {
        "message": "Requisition item created",
        "item_id": item.item_id,
    }

# --------------------------------------------------
# LIST ITEMS FOR A REQUISITION
# --------------------------------------------------
@router.get("/{req_id}/items")
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
@router.post("/items/{item_id}/assign")
def assign_employee_to_item(
    item_id: int,
    payload: AssignEmployeeRequest,
    db: Session = Depends(get_db),
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

    item.assigned_emp_id = payload.emp_id
    item.item_status = "Fulfilled"

    db.commit()

    return {"message": "Employee assigned successfully"}

# --------------------------------------------------
# UPDATE ITEM STATUS
# --------------------------------------------------
@router.patch("/items/{item_id}/status")
def update_item_status(
    item_id: int,
    payload: UpdateItemStatusRequest,
    db: Session = Depends(get_db),
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
    db.commit()

    return {"message": "Item status updated"}
