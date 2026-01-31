from datetime import datetime
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload
from typing import Optional, List

from db.session import get_db
from db.models.auth import User
from utils.dependencies import (
    require_any_role,
    validate_status_transition,
    get_current_user_roles,
)
from db.models.requisition import Requisition
from db.models.requisition_item import RequisitionItem
from db.models.audit_log import AuditLog
from schemas.requisition import (
    RequisitionCreate,
    RequisitionUpdate,
    RequisitionStatusUpdate,
    RequisitionAssign,
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
            overall_status="Pending Budget Approval",
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
    my_assignments: bool = False,
    assigned_ta: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "Employee", "TA")),
    roles: List[str] = Depends(get_current_user_roles),
):
    query = db.query(Requisition).options(selectinload(Requisition.items))

    if "TA" in roles:
        query = query.filter(
            Requisition.overall_status.in_(
                ["Approved & Unassigned", "Active"]
            )
        )

        if my_assignments:
            query = query.filter(
                Requisition.assigned_ta == current_user.user_id,
                Requisition.overall_status == "Active",
            )

    if assigned_ta is not None:
        query = query.filter(Requisition.assigned_ta == assigned_ta)

    if status:
        query = query.filter(Requisition.overall_status == status)

    if raised_by is not None:
        query = query.filter(Requisition.raised_by == raised_by)

    return query.all()


@router.get("/my", response_model=list[RequisitionResponse])
def list_my_requisitions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "Employee", "TA"))
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
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "Employee", "TA"))
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

    updates = payload.dict(exclude_unset=True)
    old_budget = requisition.budget_amount

    if "overall_status" in updates and updates["overall_status"] not in (
        "Pending Budget Approval",
        "Pending HR Approval",
        "Approved & Unassigned",
        "Active",
        "Closed",
        "Rejected",
    ):
        raise HTTPException(status_code=400, detail="Invalid status")

    for field, value in updates.items():
        setattr(requisition, field, value)

    if "budget_amount" in updates and updates.get("budget_amount") != old_budget:
        audit = AuditLog(
            entity_name="requisition",
            entity_id=str(requisition.req_id),
            action="BUDGET_UPDATE",
            performed_by=current_user.user_id,
            old_value=json.dumps({
                "budget_amount": str(old_budget) if old_budget is not None else None
            }),
            new_value=json.dumps({
                "budget_amount": str(updates.get("budget_amount")) if updates.get("budget_amount") is not None else None
            }),
        )
        db.add(audit)

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
        "Pending Budget Approval",
        "Pending HR Approval",
        "Approved & Unassigned",
        "Active",
        "Closed",
        "Rejected",
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

    validate_status_transition(requisition.overall_status, "Pending HR Approval")
    requisition.budget_approved_by = current_user.user_id
    requisition.overall_status = "Pending HR Approval"
    db.commit()

    return {"message": "Budget approved"}


@router.patch("/{req_id}/approve-release")
def approve_and_release(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Admin", "HR"))
):
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    validate_status_transition(requisition.overall_status, "Approved & Unassigned")
    requisition.approved_by = current_user.user_id
    requisition.approval_history = datetime.utcnow()
    requisition.overall_status = "Approved & Unassigned"
    db.commit()

    return {"message": "Requisition approved and released"}


@router.patch("/{req_id}/assign-ta")
def assign_ta(
    req_id: int,
    payload: RequisitionAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Admin", "HR"))
):
    requisition = (
        db.query(Requisition)
        .filter(Requisition.req_id == req_id)
        .with_for_update()
        .first()
    )

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    if requisition.assigned_ta is not None:
        raise HTTPException(status_code=409, detail="Requisition already assigned")

    if requisition.overall_status != "Approved & Unassigned":
        raise HTTPException(
            status_code=400,
            detail="Requisition is not ready for TA assignment",
        )

    validate_status_transition(requisition.overall_status, "Active")
    requisition.assigned_ta = payload.ta_user_id
    requisition.assigned_at = datetime.utcnow()
    requisition.overall_status = "Active"

    audit = AuditLog(
        entity_name="requisition",
        entity_id=str(requisition.req_id),
        action="TA_ASSIGN",
        performed_by=current_user.user_id,
        old_value=json.dumps({"assigned_ta": None, "overall_status": "Approved & Unassigned"}),
        new_value=json.dumps({
            "assigned_ta": payload.ta_user_id,
            "overall_status": "Active",
        }),
    )
    db.add(audit)

    db.commit()
    return {"message": "TA assigned", "assigned_ta": payload.ta_user_id}


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
