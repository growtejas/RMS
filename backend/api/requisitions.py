from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.auth import User
from utils.dependencies import require_any_role
from db.models.requisition import Requisition
from schemas.requisition import (
    RequisitionCreate,
    RequisitionUpdate,
    RequisitionStatusUpdate,
)

router = APIRouter(
    prefix="/requisitions",
    tags=["Requisitions"]
)


@router.post("/")
def create_requisition(
    payload: RequisitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR"))
):
    requisition = Requisition(
        project_name=payload.project_name,
        client_name=payload.client_name,
        justification=payload.justification,
        manager_notes=payload.manager_notes,
        priority=payload.priority,
        is_replacement=payload.is_replacement or False,
        duration=payload.duration,
        work_mode=payload.work_mode,
        office_location=payload.office_location,
        budget_amount=payload.budget_amount,
        required_by_date=payload.required_by_date,
        date_closed=payload.date_closed,
        raised_by=current_user.user_id,
        overall_status="Pending Budget",
    )

    db.add(requisition)
    db.commit()
    db.refresh(requisition)

    return {
        "message": "Requisition created",
        "req_id": requisition.req_id
    }

@router.get("/")
def list_requisitions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "Employee"))
):
    return db.query(Requisition).all()

@router.get("/{req_id}")
def get_requisition(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "Employee"))
):
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    return requisition


@router.patch("/{req_id}")
def update_requisition(
    req_id: int,
    payload: RequisitionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR"))
):
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(requisition, field, value)

    db.commit()
    return {"message": "Requisition updated"}

@router.patch("/{req_id}/status")
def update_requisition_status(
    req_id: int,
    payload: RequisitionStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR"))
):
    if payload.overall_status not in (
        "Pending Budget",
        "Pending HR",
        "Approved & Unassigned",
        "Active",
        "Closed",
        "Expired",
    ):
        raise HTTPException(status_code=400, detail="Invalid status")

    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    requisition.overall_status = payload.overall_status
    db.commit()

    return {"message": "Status updated"}

@router.post("/{req_id}/approve-budget")
def approve_budget(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Admin", "HR"))
):
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    requisition.budget_approved_by = current_user.user_id
    if requisition.overall_status == "Pending Budget":
        requisition.overall_status = "Pending HR"
    db.commit()

    return {"message": "Budget approved"}


@router.post("/{req_id}/cancel")
def cancel_requisition(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR"))
):
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    requisition.overall_status = "Closed"
    db.commit()

    return {"message": "Requisition cancelled"}
