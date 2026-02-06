"""
============================================================================
WORKFLOW ROUTES - API Endpoints for Workflow Operations
============================================================================

RBM Resource Fulfillment Module — Workflow Specification v1.0.0

All status transitions MUST go through these endpoints.
Status updates via PATCH are FORBIDDEN (GC-001).

Endpoint Pattern:
    POST /api/requisitions/{id}/workflow/{action}
    POST /api/requisition-items/{id}/workflow/{action}
"""

from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, Field, validator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.auth import User
from utils.dependencies import require_any_role, get_current_user_roles

from services.requisition.workflow_engine_v2 import (
    RequisitionWorkflowEngine,
    RequisitionItemWorkflowEngine,
)
from services.requisition.workflow_matrix import (
    RequisitionStatus,
    RequisitionItemStatus,
    HEADER_TRANSITIONS,
    ITEM_TRANSITIONS,
    HEADER_TERMINAL_STATES,
    ITEM_TERMINAL_STATES,
    get_header_authorized_roles,
    get_item_authorized_roles,
    is_system_only_header_transition,
    is_system_only_item_transition,
)
from services.requisition.workflow_exceptions import (
    WorkflowException,
    InvalidTransitionException,
    TerminalStateException,
    AuthorizationException,
    ConcurrencyConflictException,
    EntityLockedException,
    ValidationException,
    PrerequisiteException,
    EntityNotFoundException,
    SystemOnlyTransitionException,
    ReasonRequiredException,
)


# ============================================================================
# REQUEST SCHEMAS
# ============================================================================

class WorkflowTransitionRequest(BaseModel):
    """Base request for workflow transitions."""
    reason: Optional[str] = Field(None, min_length=1, max_length=2000)
    expected_version: Optional[int] = Field(None, ge=0)
    
    @validator('reason')
    def validate_reason_for_required_actions(cls, v):
        if v:
            return v.strip()
        return v


class RejectRequest(WorkflowTransitionRequest):
    """Request for reject action."""
    reason: str = Field(..., min_length=10, max_length=2000)


class CancelRequest(WorkflowTransitionRequest):
    """Request for cancel action."""
    reason: str = Field(..., min_length=10, max_length=2000)


class AssignTARequest(BaseModel):
    """Request for TA assignment."""
    ta_user_id: int = Field(..., gt=0)


class ShortlistRequest(BaseModel):
    """Request for shortlist action."""
    candidate_count: Optional[int] = Field(None, ge=1)


class MakeOfferRequest(BaseModel):
    """Request for make offer action."""
    candidate_id: Optional[str] = Field(None)
    offer_details: Optional[dict] = Field(None)


class FulfillRequest(BaseModel):
    """Request for fulfill action."""
    employee_id: str = Field(..., min_length=1)


class BackwardTransitionRequest(BaseModel):
    """Request for backward transitions (require reason)."""
    reason: str = Field(..., min_length=10, max_length=2000)


class SwapTARequest(BaseModel):
    """Request for TA swap."""
    new_ta_id: int = Field(..., gt=0)
    reason: str = Field(..., min_length=5, max_length=2000)


# ============================================================================
# RESPONSE SCHEMAS
# ============================================================================

class WorkflowTransitionResponse(BaseModel):
    """Response for successful workflow transition."""
    success: bool = True
    entity_id: int
    entity_type: str
    previous_status: str
    new_status: str
    transitioned_at: datetime
    transitioned_by: int
    
    class Config:
        from_attributes = True


class WorkflowErrorResponse(BaseModel):
    """Response for workflow errors."""
    error: bool = True
    code: str
    message: str
    details: Optional[dict] = None


# ============================================================================
# F-003: ALLOWED TRANSITIONS RESPONSE SCHEMA
# ============================================================================

class TransitionInfo(BaseModel):
    """Information about a single allowed transition."""
    target_status: str
    authorized_roles: List[str]
    requires_reason: bool = False
    is_system_only: bool = False
    description: Optional[str] = None


class AllowedTransitionsResponse(BaseModel):
    """
    F-003: Response for allowed transitions query.
    
    Provides frontend with dynamic transition information instead of
    hardcoded workflow definitions.
    """
    entity_type: str  # "requisition" or "requisition_item"
    entity_id: int
    current_status: str
    is_terminal: bool
    allowed_transitions: List[TransitionInfo]
    
    class Config:
        from_attributes = True


# ============================================================================
# EXCEPTION HANDLER
# ============================================================================

def handle_workflow_exception(e: WorkflowException) -> HTTPException:
    """Convert workflow exception to HTTPException."""
    return HTTPException(
        status_code=e.http_status,
        detail=e.to_dict(),
    )


# ============================================================================
# REQUISITION WORKFLOW ROUTER
# ============================================================================

requisition_workflow_router = APIRouter(
    prefix="/requisitions/{req_id}/workflow",
    tags=["Requisition Workflow"],
)


# ============================================================================
# F-003: ALLOWED TRANSITIONS ENDPOINT
# ============================================================================

@requisition_workflow_router.get(
    "/allowed-transitions",
    response_model=AllowedTransitionsResponse,
    responses={
        404: {"model": WorkflowErrorResponse},
    },
)
async def get_allowed_requisition_transitions(
    req_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "TA")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    F-003: Get allowed transitions for a requisition.
    
    Returns the list of valid transitions from the current status,
    along with authorization requirements for each.
    
    This enables the frontend to dynamically show available actions
    instead of hardcoding workflow logic.
    """
    from db.models.requisition import Requisition
    
    requisition = db.query(Requisition).filter(Requisition.req_id == req_id).first()
    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")
    
    try:
        current_status = RequisitionStatus(requisition.overall_status)
    except ValueError:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid status value: {requisition.overall_status}"
        )
    
    is_terminal = current_status in HEADER_TERMINAL_STATES
    allowed_targets = HEADER_TRANSITIONS.get(current_status, set())
    
    transitions = []
    for target in allowed_targets:
        authorized_roles = get_header_authorized_roles(current_status, target)
        is_system_only = is_system_only_header_transition(current_status, target)
        
        # Check if this transition requires a reason (e.g., rejection, cancellation)
        requires_reason = target in {
            RequisitionStatus.REJECTED, 
            RequisitionStatus.CANCELLED
        }
        
        transitions.append(TransitionInfo(
            target_status=target.value,
            authorized_roles=[r.value for r in authorized_roles],
            requires_reason=requires_reason,
            is_system_only=is_system_only,
            description=f"Transition from {current_status.value} to {target.value}",
        ))
    
    return AllowedTransitionsResponse(
        entity_type="requisition",
        entity_id=req_id,
        current_status=current_status.value,
        is_terminal=is_terminal,
        allowed_transitions=transitions,
    )


@requisition_workflow_router.post(
    "/submit",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
        409: {"model": WorkflowErrorResponse},
    },
)
async def submit_requisition(
    req_id: int,
    request: WorkflowTransitionRequest = WorkflowTransitionRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Submit requisition for budget approval.
    
    Transition: DRAFT → PENDING_BUDGET
    Authorized: Manager
    """
    try:
        requisition = RequisitionWorkflowEngine.submit(
            db=db,
            req_id=req_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            expected_version=request.expected_version,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=requisition.req_id,
            entity_type="requisition",
            previous_status=RequisitionStatus.DRAFT.value,
            new_status=requisition.overall_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@requisition_workflow_router.post(
    "/approve-budget",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
        409: {"model": WorkflowErrorResponse},
    },
)
async def approve_budget(
    req_id: int,
    request: WorkflowTransitionRequest = WorkflowTransitionRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Approve budget for requisition.
    
    Transition: PENDING_BUDGET → PENDING_HR
    Authorized: Manager, Admin
    """
    try:
        old_status = RequisitionStatus.PENDING_BUDGET.value
        requisition = RequisitionWorkflowEngine.approve_budget(
            db=db,
            req_id=req_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            expected_version=request.expected_version,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=requisition.req_id,
            entity_type="requisition",
            previous_status=old_status,
            new_status=requisition.overall_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@requisition_workflow_router.post(
    "/approve-hr",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
        409: {"model": WorkflowErrorResponse},
    },
)
async def approve_hr(
    req_id: int,
    request: WorkflowTransitionRequest = WorkflowTransitionRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    HR approval of requisition.
    
    Transition: PENDING_HR → ACTIVE
    Authorized: HR, Admin
    """
    try:
        old_status = RequisitionStatus.PENDING_HR.value
        requisition = RequisitionWorkflowEngine.approve_hr(
            db=db,
            req_id=req_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            expected_version=request.expected_version,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=requisition.req_id,
            entity_type="requisition",
            previous_status=old_status,
            new_status=requisition.overall_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@requisition_workflow_router.post(
    "/reject",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
        422: {"model": WorkflowErrorResponse},
    },
)
async def reject_requisition(
    req_id: int,
    request: RejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "HR", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Reject requisition.
    
    Transition: PENDING_BUDGET/PENDING_HR → REJECTED
    Authorized: Manager (PENDING_BUDGET), HR (PENDING_HR), Admin (both)
    Requires: reason (min 10 chars)
    """
    try:
        # Get current status before transition
        from services.requisition.workflow_engine_v2 import RequisitionWorkflowEngine as Engine
        req = Engine._get_locked_requisition(db, req_id)
        old_status = req.overall_status
        
        requisition = RequisitionWorkflowEngine.reject(
            db=db,
            req_id=req_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            reason=request.reason,
            expected_version=request.expected_version,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=requisition.req_id,
            entity_type="requisition",
            previous_status=old_status,
            new_status=requisition.overall_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@requisition_workflow_router.post(
    "/cancel",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
        422: {"model": WorkflowErrorResponse},
    },
)
async def cancel_requisition(
    req_id: int,
    request: CancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "HR", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Cancel requisition.
    
    Transition: DRAFT/PENDING_BUDGET/PENDING_HR/ACTIVE → CANCELLED
    Authorized: Manager, HR, Admin (varies by state)
    Requires: reason (min 10 chars)
    """
    try:
        # Get current status before transition
        from services.requisition.workflow_engine_v2 import RequisitionWorkflowEngine as Engine
        req = Engine._get_locked_requisition(db, req_id)
        old_status = req.overall_status
        
        requisition = RequisitionWorkflowEngine.cancel(
            db=db,
            req_id=req_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            reason=request.reason,
            expected_version=request.expected_version,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=requisition.req_id,
            entity_type="requisition",
            previous_status=old_status,
            new_status=requisition.overall_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


# ============================================================================
# F-004: REOPEN FOR REVISION ENDPOINT
# ============================================================================

@requisition_workflow_router.post(
    "/reopen",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
    },
)
async def reopen_requisition(
    req_id: int,
    request: WorkflowTransitionRequest = WorkflowTransitionRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    F-004: Reopen a rejected requisition for revision.
    
    Transition: REJECTED → DRAFT
    Authorized: Manager (requester), Admin
    
    Allows the original requester to address rejection feedback,
    make edits, and resubmit the requisition.
    """
    try:
        requisition = RequisitionWorkflowEngine.reopen_for_revision(
            db=db,
            req_id=req_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            reason=request.reason,
            expected_version=request.expected_version,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=requisition.req_id,
            entity_type="requisition",
            previous_status=RequisitionStatus.REJECTED.value,
            new_status=requisition.overall_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


# ============================================================================
# REQUISITION ITEM WORKFLOW ROUTER
# ============================================================================

item_workflow_router = APIRouter(
    prefix="/requisition-items/{item_id}/workflow",
    tags=["Requisition Item Workflow"],
)


# ============================================================================
# F-003: ALLOWED TRANSITIONS ENDPOINT (ITEMS)
# ============================================================================

@item_workflow_router.get(
    "/allowed-transitions",
    response_model=AllowedTransitionsResponse,
    responses={
        404: {"model": WorkflowErrorResponse},
    },
)
async def get_allowed_item_transitions(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "Admin", "HR", "TA")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    F-003: Get allowed transitions for a requisition item.
    
    Returns the list of valid transitions from the current status,
    along with authorization requirements for each.
    """
    from db.models.requisition_item import RequisitionItem
    from services.requisition.workflow_matrix import ITEM_BACKWARD_TRANSITIONS
    
    item = db.query(RequisitionItem).filter(RequisitionItem.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    try:
        current_status = RequisitionItemStatus(item.item_status)
    except ValueError:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid status value: {item.item_status}"
        )
    
    is_terminal = current_status in ITEM_TERMINAL_STATES
    allowed_targets = ITEM_TRANSITIONS.get(current_status, set())
    
    transitions = []
    for target in allowed_targets:
        authorized_roles = get_item_authorized_roles(current_status, target)
        is_system_only = is_system_only_item_transition(current_status, target)
        
        # Check if this is a backward transition (requires reason)
        is_backward = (current_status, target) in ITEM_BACKWARD_TRANSITIONS
        requires_reason = is_backward or target == RequisitionItemStatus.CANCELLED
        
        transitions.append(TransitionInfo(
            target_status=target.value,
            authorized_roles=[r.value for r in authorized_roles],
            requires_reason=requires_reason,
            is_system_only=is_system_only,
            description=f"Transition from {current_status.value} to {target.value}",
        ))
    
    return AllowedTransitionsResponse(
        entity_type="requisition_item",
        entity_id=item_id,
        current_status=current_status.value,
        is_terminal=is_terminal,
        allowed_transitions=transitions,
    )


@item_workflow_router.post(
    "/assign-ta",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
    },
)
async def assign_ta_to_item(
    item_id: int,
    request: AssignTARequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Assign TA to item.
    
    GC-003: Auto-transitions PENDING → SOURCING
    Authorized: HR, Admin
    """
    try:
        # Get current status before transition
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        old_status = item.item_status
        
        updated_item = RequisitionItemWorkflowEngine.assign_ta(
            db=db,
            item_id=item_id,
            ta_user_id=request.ta_user_id,
            performed_by=current_user.user_id,
            user_roles=user_roles,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=old_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@item_workflow_router.post(
    "/shortlist",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
    },
)
async def shortlist_item(
    item_id: int,
    request: ShortlistRequest = ShortlistRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("TA", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Move item to SHORTLISTED.
    
    Transition: SOURCING → SHORTLISTED
    Authorized: TA, Admin
    """
    try:
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        old_status = item.item_status
        
        updated_item = RequisitionItemWorkflowEngine.shortlist(
            db=db,
            item_id=item_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            candidate_count=request.candidate_count,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=old_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@item_workflow_router.post(
    "/start-interview",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
    },
)
async def start_interview(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("TA", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Move item to INTERVIEWING.
    
    Transition: SHORTLISTED → INTERVIEWING
    Authorized: TA, Admin
    """
    try:
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        old_status = item.item_status
        
        updated_item = RequisitionItemWorkflowEngine.start_interview(
            db=db,
            item_id=item_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=old_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@item_workflow_router.post(
    "/make-offer",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
    },
)
async def make_offer(
    item_id: int,
    request: MakeOfferRequest = MakeOfferRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("TA", "HR", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Move item to OFFERED.
    
    Transition: INTERVIEWING → OFFERED
    Authorized: TA, HR, Admin
    """
    try:
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        old_status = item.item_status
        
        updated_item = RequisitionItemWorkflowEngine.make_offer(
            db=db,
            item_id=item_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            candidate_id=request.candidate_id,
            offer_details=request.offer_details,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=old_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@item_workflow_router.post(
    "/fulfill",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
    },
)
async def fulfill_item(
    item_id: int,
    request: FulfillRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Fulfill item by assigning employee.
    
    Transition: OFFERED → FULFILLED
    Authorized: HR, Admin
    GC-004: Requires employee_id
    """
    try:
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        old_status = item.item_status
        
        updated_item = RequisitionItemWorkflowEngine.fulfill(
            db=db,
            item_id=item_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            employee_id=request.employee_id,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=old_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@item_workflow_router.post(
    "/cancel",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
        422: {"model": WorkflowErrorResponse},
    },
)
async def cancel_item(
    item_id: int,
    request: CancelRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("Manager", "HR", "TA", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Cancel item.
    
    Transition: Any non-terminal → CANCELLED
    Authorized: Manager, HR, TA, Admin
    Requires: reason (min 10 chars)
    """
    try:
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        old_status = item.item_status
        
        updated_item = RequisitionItemWorkflowEngine.cancel(
            db=db,
            item_id=item_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            reason=request.reason,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=old_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


# =========================================================================
# BACKWARD TRANSITION ENDPOINTS
# =========================================================================

@item_workflow_router.post(
    "/re-source",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
        422: {"model": WorkflowErrorResponse},
    },
)
async def re_source_item(
    item_id: int,
    request: BackwardTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("TA", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Return item to SOURCING (backward transition).
    
    Transition: SHORTLISTED → SOURCING
    Authorized: TA, Admin
    GC-009: Requires reason (min 10 chars)
    """
    try:
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        old_status = item.item_status
        
        updated_item = RequisitionItemWorkflowEngine.re_source(
            db=db,
            item_id=item_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            reason=request.reason,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=old_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@item_workflow_router.post(
    "/return-shortlist",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
        422: {"model": WorkflowErrorResponse},
    },
)
async def return_to_shortlist(
    item_id: int,
    request: BackwardTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("TA", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Return item to SHORTLISTED (backward transition).
    
    Transition: INTERVIEWING → SHORTLISTED
    Authorized: TA, Admin
    GC-009: Requires reason (min 10 chars)
    """
    try:
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        old_status = item.item_status
        
        updated_item = RequisitionItemWorkflowEngine.return_to_shortlist(
            db=db,
            item_id=item_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            reason=request.reason,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=old_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@item_workflow_router.post(
    "/offer-declined",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
        422: {"model": WorkflowErrorResponse},
    },
)
async def offer_declined(
    item_id: int,
    request: BackwardTransitionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("TA", "HR", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Return item to INTERVIEWING after offer declined (backward transition).
    
    Transition: OFFERED → INTERVIEWING
    Authorized: TA, HR, Admin
    GC-009: Requires reason (min 10 chars)
    """
    try:
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        old_status = item.item_status
        
        updated_item = RequisitionItemWorkflowEngine.offer_declined(
            db=db,
            item_id=item_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            reason=request.reason,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=old_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)


@item_workflow_router.post(
    "/swap-ta",
    response_model=WorkflowTransitionResponse,
    responses={
        400: {"model": WorkflowErrorResponse},
        403: {"model": WorkflowErrorResponse},
        404: {"model": WorkflowErrorResponse},
    },
)
async def swap_ta(
    item_id: int,
    request: SwapTARequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_any_role("HR", "Admin")),
    user_roles: List[str] = Depends(get_current_user_roles),
):
    """
    Swap TA assigned to item.
    
    Authorized: HR, Admin
    """
    try:
        item = RequisitionItemWorkflowEngine._get_locked_item(db, item_id)
        
        updated_item = RequisitionItemWorkflowEngine.swap_ta(
            db=db,
            item_id=item_id,
            new_ta_id=request.new_ta_id,
            user_id=current_user.user_id,
            user_roles=user_roles,
            reason=request.reason,
        )
        db.commit()
        
        return WorkflowTransitionResponse(
            entity_id=updated_item.item_id,
            entity_type="requisition_item",
            previous_status=updated_item.item_status,
            new_status=updated_item.item_status,
            transitioned_at=datetime.utcnow(),
            transitioned_by=current_user.user_id,
        )
    except WorkflowException as e:
        db.rollback()
        raise handle_workflow_exception(e)
