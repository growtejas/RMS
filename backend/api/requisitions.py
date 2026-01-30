from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload
from typing import Optional

from db.session import get_db
from db.models.auth import User
from utils.dependencies import require_any_role, validate_status_transition
from db.models.requisition import Requisition
from db.models.requisition_item import RequisitionItem
from schemas.requisition import (
    RequisitionCreate,
    RequisitionUpdate,
    RequisitionStatusUpdate,
    RequisitionResponse,
)
from schemas.requisition_item import RequisitionItemResponse

router = APIRouter(
    prefix="/requisitions",
    tags=["Requisitions"]
)


@router.post("/", response_model=RequisitionResponse)
def create_requisition(
    payload: RequisitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR"))
):
    try:
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
            overall_status="Draft",
        )

        db.add(requisition)
        db.flush()

        if payload.items:
            for item in payload.items:
                db_item = RequisitionItem(
                    req_id=requisition.req_id,
                    role_position=item.role_position,
                    job_description=item.job_description,
                    skill_level=item.skill_level,
                    experience_years=item.experience_years,
                    education_requirement=item.education_requirement,
                    requirements=item.requirements,
                    item_status="Pending",
                )
                db.add(db_item)

        db.commit()
        db.refresh(requisition)
        return requisition
    except Exception:
        db.rollback()
        raise

@router.get("/", response_model=list[RequisitionResponse])
def list_requisitions(
    status: Optional[str] = None,
    raised_by: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "Employee"))
):
    query = db.query(Requisition).options(selectinload(Requisition.items))

    if status:
        query = query.filter(Requisition.overall_status == status)

    if raised_by is not None:
        query = query.filter(Requisition.raised_by == raised_by)

    return query.all()


@router.get("/my", response_model=list[RequisitionResponse])
def list_my_requisitions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "Employee"))
):
    return (
        db.query(Requisition)
        .options(selectinload(Requisition.items))
        .filter(Requisition.raised_by == current_user.user_id)
        .all()
    )

@router.get("/{req_id}", response_model=RequisitionResponse)
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
        "Draft",
        "Pending Budget",
        "Approved",
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

@router.patch("/{req_id}/approve-budget")
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

    validate_status_transition(requisition.overall_status, "Approved")
    requisition.budget_approved_by = 2
    requisition.overall_status = "Approved"
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
