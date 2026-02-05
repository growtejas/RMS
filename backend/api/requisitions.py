from datetime import datetime, date
import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload
from typing import Optional, List

from db.session import get_db
from db.models.auth import User
from utils.dependencies import (
    require_any_role,
    get_current_user_roles,
)
from db.models.requisition import Requisition
from db.models.requisition_item import RequisitionItem
from schemas.requisition import (
    RequisitionManagerUpdate,
    RequisitionUpdate,
    RequisitionStatusUpdate,
    RequisitionAssign,
    RequisitionReject,
    RequisitionResponse,
)
from schemas.requisition_item import RequisitionItemCreate
from schemas.requisition_item import RequisitionItemResponse
from utils.storage import get_storage_service, StorageService

# Workflow engine imports
from services.requisition import (
    RequisitionWorkflowEngine,
    RequisitionEvents,
    RequisitionPermissions,
)
from services.requisition.workflow_engine import WorkflowError
from services.notification_service import send as notify

router = APIRouter(
    prefix="/requisitions",
    tags=["Requisitions"]
)


@router.post("/", response_model=RequisitionResponse)
async def create_requisition(
    project_name: str | None = Form(None),
    client_name: str | None = Form(None),
    office_location: str | None = Form(None),
    work_mode: str | None = Form(None),
    required_by_date: str | None = Form(None),
    priority: str | None = Form(None),
    justification: str | None = Form(None),
    budget_amount: str | None = Form(None),
    duration: str | None = Form(None),
    is_replacement: bool = Form(False),
    manager_notes: str | None = Form(None),
    items_json: str = Form("[]"),
    jd_file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR")),
):
    try:
        normalized_client = client_name.strip() if client_name else None
        normalized_client = normalized_client or None
        normalized_duration = duration.strip() if duration else None
        normalized_duration = normalized_duration or None

        parsed_budget = None
        if budget_amount:
            try:
                parsed_budget = float(budget_amount)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid budget")

        parsed_required_by = None
        if required_by_date:
            try:
                parsed_required_by = date.fromisoformat(required_by_date)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Invalid required_by_date") from exc

        try:
            items_payload = json.loads(items_json or "[]")
            if not isinstance(items_payload, list):
                raise ValueError("items_json must be a list")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid items payload") from exc

        requisition = Requisition(
            project_name=project_name or None,
            client_name=normalized_client,
            justification=justification or None,
            manager_notes=manager_notes or None,
            priority=priority or None,
            is_replacement=is_replacement,
            duration=normalized_duration,
            work_mode=work_mode or None,
            office_location=office_location or None,
            budget_amount=parsed_budget,
            required_by_date=parsed_required_by,
            raised_by=current_user.user_id,
            overall_status="Pending Budget Approval",
        )

        db.add(requisition)
        db.flush()

        if items_payload:
            for item in items_payload:
                validated = RequisitionItemCreate(**item)
                db_item = RequisitionItem(
                    req_id=requisition.req_id,
                    role_position=validated.role_position,
                    job_description=validated.job_description,
                    skill_level=validated.skill_level,
                    experience_years=validated.experience_years,
                    education_requirement=validated.education_requirement,
                    requirements=validated.requirements,
                    item_status="Pending",
                )
                db.add(db_item)

        if jd_file:
            if jd_file.content_type != "application/pdf":
                raise HTTPException(status_code=400, detail="JD must be a PDF")
            jd_file.file.seek(0, 2)
            size = jd_file.file.tell()
            jd_file.file.seek(0)
            if size > 10 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="JD exceeds 10MB")

            timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
            safe_name = f"{requisition.req_id}_{timestamp}.pdf"
            file_key = storage.save(jd_file, safe_name)
            requisition.jd_file_key = file_key

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

    items = (
        db.query(RequisitionItem)
        .filter(RequisitionItem.req_id == req_id)
        .all()
    )

    total_items = len(items)
    fulfilled_items = sum(1 for item in items if item.item_status == "Fulfilled")
    cancelled_items = sum(1 for item in items if item.item_status == "Cancelled")
    active_items = total_items - cancelled_items

    if active_items > 0:
        progress_ratio = fulfilled_items / active_items
        progress_text = f"{fulfilled_items}/{active_items}"
    else:
        progress_ratio = 1.0
        progress_text = "0/0"

    requisition.items = items
    requisition.total_items = total_items
    requisition.fulfilled_items = fulfilled_items
    requisition.cancelled_items = cancelled_items
    requisition.active_items = active_items
    requisition.progress_ratio = progress_ratio
    requisition.progress_text = progress_text

    return requisition


@router.put("/{req_id}")
def update_requisition_manager(
    req_id: int,
    payload: RequisitionManagerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager")),
):
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    # Use permissions module for ownership and status checks
    if not RequisitionPermissions.is_owner(requisition, current_user.user_id):
        raise HTTPException(status_code=403, detail="Not allowed to edit")

    if requisition.overall_status not in RequisitionPermissions.EDITABLE_STATUSES:
        raise HTTPException(status_code=403, detail="Requisition is locked")

    updates = payload.dict(exclude_unset=True)
    items_payload = updates.pop("items", None)
    old_budget = requisition.budget_amount

    for field, value in updates.items():
        setattr(requisition, field, value)

    if items_payload is not None:
        db.query(RequisitionItem).filter(
            RequisitionItem.req_id == req_id
        ).delete(synchronize_session=False)

        for item in items_payload:
            validated = RequisitionItemCreate(**item)
            db_item = RequisitionItem(
                req_id=req_id,
                role_position=validated.role_position,
                job_description=validated.job_description,
                skill_level=validated.skill_level,
                experience_years=validated.experience_years,
                education_requirement=validated.education_requirement,
                requirements=validated.requirements,
                item_status="Pending",
            )
            db.add(db_item)

    # Use events module for audit logging
    if "budget_amount" in updates and updates.get("budget_amount") != old_budget:
        RequisitionEvents.log_budget_update(
            db=db,
            req_id=requisition.req_id,
            old_budget=float(old_budget) if old_budget else None,
            new_budget=float(updates.get("budget_amount")) if updates.get("budget_amount") else None,
            performed_by=current_user.user_id,
        )

    db.commit()
    return {"message": "Requisition updated"}


@router.get("/{req_id}/jd")
def download_requisition_jd(
    req_id: int,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "TA")),
):
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    if not requisition.jd_file_key:
        raise HTTPException(status_code=404, detail="JD file not available")

    url = storage.get_url(requisition.jd_file_key)
    if url.startswith("http://") or url.startswith("https://"):
        return RedirectResponse(url)

    return FileResponse(
        url,
        media_type="application/pdf",
        filename=f"requisition_{req_id}_jd.pdf",
    )


@router.post("/{req_id}/jd")
async def upload_requisition_jd(
    req_id: int,
    jd_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    current_user: User = Depends(require_any_role("Manager")),
):
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    # Use permissions module for checks
    if not RequisitionPermissions.can_edit_jd(requisition, current_user.user_id):
        if not RequisitionPermissions.is_owner(requisition, current_user.user_id):
            raise HTTPException(status_code=403, detail="Not allowed to edit")
        raise HTTPException(status_code=403, detail="Requisition is locked")

    if jd_file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="JD must be a PDF")

    jd_file.file.seek(0, 2)
    size = jd_file.file.tell()
    jd_file.file.seek(0)
    if size > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="JD exceeds 10MB")

    if requisition.jd_file_key:
        storage.delete(requisition.jd_file_key)

    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    safe_name = f"{req_id}_{timestamp}.pdf"
    file_key = storage.save(jd_file, safe_name)
    requisition.jd_file_key = file_key
    db.commit()

    return {"message": "JD uploaded", "jd_file_key": file_key}


@router.delete("/{req_id}/jd")
def delete_requisition_jd(
    req_id: int,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    current_user: User = Depends(require_any_role("Manager")),
):
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    # Use permissions module for checks
    if not RequisitionPermissions.can_edit_jd(requisition, current_user.user_id):
        if not RequisitionPermissions.is_owner(requisition, current_user.user_id):
            raise HTTPException(status_code=403, detail="Not allowed to edit")
        raise HTTPException(status_code=403, detail="Requisition is locked")

    if not requisition.jd_file_key:
        raise HTTPException(status_code=404, detail="JD file not available")

    storage.delete(requisition.jd_file_key)
    requisition.jd_file_key = None
    db.commit()

    return {"message": "JD removed"}


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

    # PHASE 1 SAFETY: Block workflow fields from being modified via generic update
    blocked_fields = {"overall_status", "approved_by", "budget_approved_by", "assigned_ta"}
    attempted_blocked = blocked_fields & set(updates.keys())
    if attempted_blocked:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot modify workflow fields via this endpoint: {', '.join(attempted_blocked)}"
        )

    old_budget = requisition.budget_amount

    for field, value in updates.items():
        setattr(requisition, field, value)

    # Use events module for audit logging
    if "budget_amount" in updates and updates.get("budget_amount") != old_budget:
        RequisitionEvents.log_budget_update(
            db=db,
            req_id=requisition.req_id,
            old_budget=float(old_budget) if old_budget else None,
            new_budget=float(updates.get("budget_amount")) if updates.get("budget_amount") else None,
            performed_by=current_user.user_id,
        )

    db.commit()
    return {"message": "Requisition updated"}

@router.patch("/{req_id}/status")
def update_requisition_status(
    req_id: int,
    payload: RequisitionStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR"))
):
    # PHASE 1 SAFETY: Direct status override is disabled
    # Use dedicated workflow endpoints instead (approve_budget, approve_requisition, assign_ta, etc.)
    raise HTTPException(
        status_code=403,
        detail="Direct status modification is disabled. Use workflow endpoints."
    )


@router.patch("/{req_id}/approve-budget")
def approve_budget(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Admin", "HR"))
):
    """Approve budget for a requisition. Transitions to Pending HR Approval."""
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    try:
        RequisitionWorkflowEngine.approve_budget(
            db=db,
            requisition=requisition,
            user_id=current_user.user_id,
        )
        db.commit()
        notify(
            requisition.raised_by,
            f"HEADER_APPROVED: Requisition {req_id} budget approved",
        )
        return {"message": "Budget approved"}
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/{req_id}/approve")
def approve_requisition(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR"))
):
    """HR approval of a requisition. Transitions to Approved & Unassigned."""
    requisition = (
        db.query(Requisition)
        .filter(Requisition.req_id == req_id)
        .with_for_update()
        .first()
    )

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    try:
        RequisitionWorkflowEngine.approve_hr(
            db=db,
            requisition=requisition,
            user_id=current_user.user_id,
        )
        db.commit()
        notify(
            requisition.raised_by,
            f"HEADER_APPROVED: Requisition {req_id} approved",
        )
        return {"message": "Requisition approved"}
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/{req_id}/approve-release")
def approve_and_release(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Admin", "HR"))
):
    """Combined approval (budget + HR). Transitions to Approved & Unassigned."""
    requisition = db.query(Requisition).filter(
        Requisition.req_id == req_id
    ).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    try:
        # This endpoint allows approval from either Pending Budget or Pending HR status
        if requisition.overall_status == "Pending Budget Approval":
            RequisitionWorkflowEngine.approve_budget(db, requisition, current_user.user_id)
        RequisitionWorkflowEngine.approve_hr(db, requisition, current_user.user_id)
        db.commit()
        notify(
            requisition.raised_by,
            f"HEADER_APPROVED: Requisition {req_id} approved and released",
        )
        return {"message": "Requisition approved and released"}
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.patch("/{req_id}/assign-ta")
def assign_ta(
    req_id: int,
    payload: RequisitionAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Admin", "HR"))
):
    """Assign a TA to a requisition. Transitions to Active."""
    requisition = (
        db.query(Requisition)
        .filter(Requisition.req_id == req_id)
        .with_for_update()
        .first()
    )

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    try:
        RequisitionWorkflowEngine.assign_ta(
            db=db,
            requisition=requisition,
            ta_user_id=payload.ta_user_id,
            performed_by=current_user.user_id,
        )
        db.commit()
        notify(
            payload.ta_user_id,
            f"ITEM_ASSIGNED_TA: Requisition {req_id} assigned to you",
        )
        return {"message": "TA assigned", "assigned_ta": payload.ta_user_id}
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


@router.put("/{req_id}/reject")
def reject_requisition(
    req_id: int,
    payload: RequisitionReject,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR"))
):
    """Reject a requisition. Requires reason."""
    requisition = (
        db.query(Requisition)
        .filter(Requisition.req_id == req_id)
        .with_for_update()
        .first()
    )

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    try:
        RequisitionWorkflowEngine.reject(
            db=db,
            requisition=requisition,
            user_id=current_user.user_id,
            reason=payload.reason,
        )
        db.commit()
        notify(
            requisition.raised_by,
            f"HEADER_REJECTED: Requisition {req_id} rejected",
        )
        return {"message": "Requisition rejected"}
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)


class RequisitionCancel(BaseModel):
    """Request body for cancellation - requires reason."""
    reason: str


@router.post("/{req_id}/cancel")
def cancel_requisition(
    req_id: int,
    payload: RequisitionCancel,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR")),
    roles: List[str] = Depends(get_current_user_roles),
):
    """Cancel a requisition. Requires reason and ownership/HR permission."""
    requisition = (
        db.query(Requisition)
        .filter(Requisition.req_id == req_id)
        .with_for_update()
        .first()
    )

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    try:
        RequisitionWorkflowEngine.cancel(
            db=db,
            requisition=requisition,
            user_id=current_user.user_id,
            user_roles=roles,
            reason=payload.reason,
        )
        db.commit()
        return {"message": "Requisition cancelled", "reason": payload.reason}
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=e.status_code, detail=e.message)
