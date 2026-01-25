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
        target_user_id=payload.target_user_id,
        old_value=payload.old_value,
        new_value=payload.new_value,
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

    logs = query.order_by(AuditLog.performed_at.desc()).all()

    user_ids = {log.performed_by for log in logs if log.performed_by}
    users_by_id = {
        user.user_id: user.username
        for user in db.query(User).filter(User.user_id.in_(user_ids)).all()
    } if user_ids else {}

    response = []
    for log in logs:
        response.append({
            "audit_id": log.audit_id,
            "entity_name": log.entity_name,
            "entity_id": log.entity_id,
            "action": log.action,
            "performed_by": log.performed_by,
            "performed_by_username": users_by_id.get(log.performed_by),
            "target_user_id": log.target_user_id,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "performed_at": log.performed_at,
        })

    return response
