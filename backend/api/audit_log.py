from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.auth import User
from utils.dependencies import require_any_role
from db.models.audit_log import AuditLog
from schemas.audit_log import AuditLogCreate

router = APIRouter(
    prefix="/audit-logs",
    tags=["Audit Logs"]
)


@router.post("/")
def create_audit_log(
    payload: AuditLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Admin", "HR"))
):
    audit = AuditLog(
        entity_name=payload.entity_name,
        entity_id=payload.entity_id,
        action=payload.action,
        performed_by=payload.performed_by,
    )

    db.add(audit)
    db.commit()
    db.refresh(audit)

    return {
        "message": "Audit log created",
        "audit_id": audit.audit_id,
    }


@router.get("/")
def list_audit_logs(
    entity_name: str | None = None,
    entity_id: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)

    if entity_name:
        query = query.filter(AuditLog.entity_name == entity_name)

    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)

    return query.order_by(AuditLog.performed_at.desc()).all()
