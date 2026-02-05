"""
Requisition Workflow Engine

Centralized business logic for requisition state transitions:
- Budget approval
- HR approval / rejection
- TA assignment
- Cancellation
- Header status recalculation from items
"""

from datetime import datetime
from typing import List

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from db.models.requisition import Requisition
from db.models.requisition_item import RequisitionItem
from db.models.employee import Employee

from .events import RequisitionEvents
from .permissions import RequisitionPermissions


class WorkflowError(Exception):
    """Exception raised for workflow validation errors."""
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class RequisitionWorkflowEngine:
    """
    Centralized workflow engine for requisition state management.
    
    IMPORTANT:
    All mutating methods must be called inside a transaction block:
        with db.begin():
            engine.method(...)
    
    The engine assumes atomic context and does not auto-commit.
    
    All methods are designed to be called from routers after fetching
    the requisition. The engine handles:
    - State validation
    - State transitions
    - Side effects (history, audit)
    
    Callers are responsible for:
    - Fetching the requisition with appropriate locking
    - Committing the transaction
    - Rolling back on error
    """

    # Valid item statuses
    VALID_ITEM_STATUSES = {"Pending", "Sourcing", "Shortlisted", "Interviewing", "Fulfilled", "Cancelled"}

    ALLOWED_ITEM_TRANSITIONS = {
        "Pending": ["Sourcing", "Cancelled"],
        "Sourcing": ["Shortlisted", "Cancelled"],
        "Shortlisted": ["Interviewing", "Cancelled"],
        "Interviewing": ["Fulfilled", "Cancelled"],
        "Fulfilled": [],
        "Cancelled": [],
    }

    # Open-like statuses for recalculation
    OPEN_LIKE_STATUSES = ["Pending", "Sourcing", "Shortlisted", "Interviewing"]

    # =========================================================================
    # APPROVAL OPERATIONS
    # =========================================================================

    @staticmethod
    def approve_budget(
        db: Session,
        requisition: Requisition,
        user_id: int,
    ) -> None:
        """
        Approve the budget for a requisition.
        Transitions: Pending Budget Approval -> Pending HR Approval
        
        Args:
            db: Database session
            requisition: Requisition to approve (should be fetched with lock)
            user_id: ID of user performing the action
            
        Raises:
            WorkflowError: If transition is not allowed
        """
        allowed, error = RequisitionPermissions.can_approve_budget(requisition)
        if not allowed:
            raise WorkflowError(error)

        old_status = requisition.overall_status
        new_status = "Pending HR Approval"

        # Perform transition
        requisition.budget_approved_by = user_id
        requisition.overall_status = new_status

        # Record history
        RequisitionEvents.record_status_history(
            db=db,
            req_id=requisition.req_id,
            old_status=old_status,
            new_status=new_status,
            changed_by=user_id,
        )

    @staticmethod
    def approve_hr(
        db: Session,
        requisition: Requisition,
        user_id: int,
    ) -> None:
        """
        HR approval of a requisition.
        Transitions: Pending HR Approval -> Approved & Unassigned
        
        Args:
            db: Database session
            requisition: Requisition to approve (should be fetched with lock)
            user_id: ID of HR user performing the action
            
        Raises:
            WorkflowError: If transition is not allowed
        """
        allowed, error = RequisitionPermissions.can_approve_hr(requisition)
        if not allowed:
            raise WorkflowError(error)

        old_status = requisition.overall_status
        new_status = "Approved & Unassigned"

        # Perform transition
        requisition.approved_by = user_id
        requisition.approval_history = datetime.utcnow()
        requisition.overall_status = new_status

        # Record history
        RequisitionEvents.record_status_history(
            db=db,
            req_id=requisition.req_id,
            old_status=old_status,
            new_status=new_status,
            changed_by=user_id,
        )

    @staticmethod
    def reject(
        db: Session,
        requisition: Requisition,
        user_id: int,
        reason: str,
    ) -> None:
        """
        Reject a requisition.
        Transitions: Pending HR Approval -> Rejected
        
        Args:
            db: Database session
            requisition: Requisition to reject (should be fetched with lock)
            user_id: ID of HR user performing the action
            reason: Rejection reason (min 10 chars)
            
        Raises:
            WorkflowError: If transition is not allowed or reason is invalid
        """
        # Validate reason
        reason = (reason or "").strip()
        if len(reason) < 10:
            raise WorkflowError(
                "Rejection reason must be at least 10 characters",
                status_code=400,
            )

        allowed, error = RequisitionPermissions.can_reject(requisition)
        if not allowed:
            raise WorkflowError(error, status_code=400 if "not pending" in error else 409)

        old_status = requisition.overall_status
        new_status = "Rejected"

        # Perform transition
        requisition.overall_status = new_status
        requisition.rejection_reason = reason

        # Record history with justification
        RequisitionEvents.record_status_history(
            db=db,
            req_id=requisition.req_id,
            old_status=old_status,
            new_status=new_status,
            changed_by=user_id,
            justification=reason,
        )

    # =========================================================================
    # ASSIGNMENT OPERATIONS
    # =========================================================================

    @staticmethod
    def assign_ta(
        db: Session,
        requisition: Requisition,
        ta_user_id: int,
        performed_by: int,
    ) -> None:
        """
        Assign a TA to a requisition (header-level).
        Transitions: Approved & Unassigned -> Active
        
        .. deprecated::
            Use assign_ta_to_item() for item-level TA assignment where possible.
        
        Args:
            db: Database session
            requisition: Requisition to assign (should be fetched with lock)
            ta_user_id: ID of TA user to assign
            performed_by: ID of user performing the action
            
        Raises:
            WorkflowError: If transition is not allowed
        """
        allowed, error = RequisitionPermissions.can_assign_ta(requisition)
        if not allowed:
            raise WorkflowError(error, status_code=409 if "already assigned" in error else 400)

        old_status = requisition.overall_status
        new_status = "Active"

        # Perform transition
        requisition.assigned_ta = ta_user_id
        requisition.assigned_at = datetime.utcnow()
        requisition.overall_status = new_status

        # Record history
        RequisitionEvents.record_status_history(
            db=db,
            req_id=requisition.req_id,
            old_status=old_status,
            new_status=new_status,
            changed_by=performed_by,
        )

        # Audit log
        RequisitionEvents.log_ta_assignment(
            db=db,
            req_id=requisition.req_id,
            ta_user_id=ta_user_id,
            performed_by=performed_by,
        )

    @staticmethod
    def assign_ta_to_item(
        db: Session,
        item: RequisitionItem,
        ta_user_id: int,
        performed_by: int,
    ) -> None:
        """
        Assign a TA to a specific requisition item (Issue 5 fix).
        
        This allows item-level TA assignment rather than header-level only.
        Does not change overall requisition status.
        
        Args:
            db: Database session
            item: RequisitionItem to assign TA to
            ta_user_id: ID of TA user to assign
            performed_by: ID of user performing the action
            
        Raises:
            WorkflowError: If assignment is not allowed
        """
        locked_item = (
            db.query(RequisitionItem)
            .filter(RequisitionItem.item_id == item.item_id)
            .with_for_update()
            .one()
        )

        if locked_item.assigned_ta is not None:
            raise WorkflowError("TA already assigned to this item")

        # Check requisition status
        requisition = (
            db.query(Requisition)
            .filter(Requisition.req_id == locked_item.req_id)
            .one()
        )

        allowed, error = RequisitionPermissions.can_mutate_item(requisition)
        if not allowed:
            raise WorkflowError(error)

        # Check item status - cannot assign TA to terminal items
        if locked_item.item_status in ("Fulfilled", "Cancelled"):
            raise WorkflowError(
                f"Cannot assign TA to item in '{locked_item.item_status}' status"
            )

        # Perform assignment
        locked_item.assigned_ta = ta_user_id

        # Audit log for item-level TA assignment
        RequisitionEvents.log_audit(
            db=db,
            req_id=locked_item.req_id,
            action="ITEM_TA_ASSIGNED",
            performed_by=performed_by,
            details={
                "item_id": locked_item.item_id,
                "ta_user_id": ta_user_id,
            },
        )

    @staticmethod
    def assign_employee_to_item(
        db: Session,
        item: RequisitionItem,
        emp_id: str,
        performed_by: int,
    ) -> None:
        """
        Assign an employee to a requisition item.
        Sets item status to Fulfilled and recalculates header status.
        
        Args:
            db: Database session
            item: RequisitionItem to assign
            emp_id: Employee ID to assign
            performed_by: ID of user performing the action
            
        Raises:
            WorkflowError: If assignment is not allowed
        """
        locked_item = (
            db.query(RequisitionItem)
            .filter(RequisitionItem.item_id == item.item_id)
            .with_for_update()
            .one()
        )

        # Check requisition status
        requisition = (
            db.query(Requisition)
            .filter(Requisition.req_id == locked_item.req_id)
            .one()
        )

        allowed, error = RequisitionPermissions.can_mutate_item(requisition)
        if not allowed:
            raise WorkflowError(error)

        # Check item status - only allow assignment for Interviewing items
        if locked_item.item_status == "Cancelled":
            raise WorkflowError("Cannot assign employee to a cancelled item")
        if locked_item.item_status == "Fulfilled":
            raise WorkflowError("Item already fulfilled")
        if locked_item.item_status != "Interviewing":
            raise WorkflowError(
                f"Cannot assign employee - item must be in 'Interviewing' status, "
                f"currently '{locked_item.item_status}'"
            )

        # Check employee exists
        employee = db.query(Employee).filter(Employee.emp_id == emp_id).first()
        if not employee:
            raise WorkflowError("Employee not found", status_code=404)

        # Check duplicate assignment
        existing = (
            db.query(RequisitionItem)
            .filter(
                RequisitionItem.assigned_emp_id == emp_id,
                RequisitionItem.item_status == "Fulfilled",
                RequisitionItem.item_id != locked_item.item_id,
            )
            .first()
        )
        if existing:
            raise WorkflowError("Employee already assigned to another fulfilled item")

        # Perform assignment
        locked_item.assigned_emp_id = emp_id
        locked_item.item_status = "Fulfilled"

        # Recalculate header status
        RequisitionWorkflowEngine.recalculate_header_status(
            db=db,
            req_id=locked_item.req_id,
            changed_by=performed_by,
        )

    # =========================================================================
    # CANCELLATION
    # =========================================================================

    @staticmethod
    def cancel(
        db: Session,
        requisition: Requisition,
        user_id: int,
        user_roles: List[str],
        reason: str,
    ) -> None:
        """
        Cancel a requisition.
        - Validates permissions
        - Cancels all non-fulfilled items
        - Sets header to Closed
        - Records history and audit
        
        Args:
            db: Database session
            requisition: Requisition to cancel (should be fetched with lock)
            user_id: ID of user performing the action
            user_roles: List of role names for the user
            reason: Cancellation reason (min 10 chars)
            
        Raises:
            WorkflowError: If cancellation is not allowed
        """
        # Validate reason
        reason = (reason or "").strip()
        if len(reason) < 10:
            raise WorkflowError(
                "Cancellation reason must be at least 10 characters",
                status_code=400,
            )

        # Check permissions
        allowed, error = RequisitionPermissions.can_cancel(
            requisition=requisition,
            user_id=user_id,
            user_roles=user_roles,
        )
        if not allowed:
            status_code = 403 if "Only HR" in error else 400
            raise WorkflowError(error, status_code=status_code)

        old_status = requisition.overall_status

        # Cancel all non-fulfilled items
        items = (
            db.query(RequisitionItem)
            .filter(
                RequisitionItem.req_id == requisition.req_id,
                RequisitionItem.item_status.notin_(("Fulfilled", "Cancelled")),
            )
            .with_for_update()
            .all()
        )

        for item in items:
            item.item_status = "Cancelled"

        # Update header status
        requisition.overall_status = "Closed"

        # Record history
        RequisitionEvents.record_status_history(
            db=db,
            req_id=requisition.req_id,
            old_status=old_status,
            new_status="Closed",
            changed_by=user_id,
            justification=reason,
        )

        # Audit log
        RequisitionEvents.log_cancellation(
            db=db,
            req_id=requisition.req_id,
            old_status=old_status,
            reason=reason,
            performed_by=user_id,
        )

    # =========================================================================
    # STATUS RECALCULATION
    # =========================================================================

    @staticmethod
    def recalculate_header_status(
        db: Session,
        req_id: int,
        changed_by: int | None = None,
    ) -> None:
        """
        Recalculate the header status based on item statuses.
        
        Rules:
        - If any items are open-like (Pending/Sourcing/Shortlisted): Active
        - If all items are Fulfilled: Fulfilled
        - If all items are Cancelled: Closed
        - If mix of Fulfilled + Cancelled: Closed (Partially Fulfilled)
        
        Args:
            db: Database session
            req_id: Requisition ID
            changed_by: User ID who triggered the recalculation
        """
        requisition = (
            db.query(Requisition)
            .filter(Requisition.req_id == req_id)
            .with_for_update()
            .one()
        )

        # Issue 3 fix: Protect Rejected and Draft statuses from recalculation
        if requisition.overall_status in ("Rejected", "Draft"):
            return

        db.flush()

        # Count item statuses
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
                            (
                                RequisitionItem.item_status.in_(
                                    RequisitionWorkflowEngine.OPEN_LIKE_STATUSES
                                ),
                                1,
                            ),
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

        # Determine new status
        if fulfilled_count == total_count:
            new_status = "Fulfilled"
        elif cancelled_count == total_count:
            new_status = "Closed"
        elif fulfilled_count + cancelled_count == total_count:
            new_status = "Closed (Partially Fulfilled)"
        elif open_like_count > 0:
            new_status = "Active"

        # Apply if changed
        if new_status != old_status:
            requisition.overall_status = new_status
            RequisitionEvents.record_status_history(
                db=db,
                req_id=req_id,
                old_status=old_status,
                new_status=new_status,
                changed_by=changed_by,
            )

    # =========================================================================
    # ITEM STATUS UPDATE
    # =========================================================================

    @staticmethod
    def update_item_status(
        db: Session,
        item: RequisitionItem,
        new_status: str,
        performed_by: int,
    ) -> None:
        """
        Update the status of a requisition item.
        
        Args:
            db: Database session
            item: RequisitionItem to update
            new_status: New status to set
            performed_by: ID of user performing the action
            
        Raises:
            WorkflowError: If update is not allowed
        """
        locked_item = (
            db.query(RequisitionItem)
            .filter(RequisitionItem.item_id == item.item_id)
            .with_for_update()
            .one()
        )

        # Validate status
        if new_status not in RequisitionWorkflowEngine.VALID_ITEM_STATUSES:
            raise WorkflowError("Invalid status")

        # Issue 1 fix: Enforce transition rules
        old_status = locked_item.item_status
        allowed_transitions = RequisitionWorkflowEngine.ALLOWED_ITEM_TRANSITIONS.get(
            old_status, []
        )
        if new_status != old_status and new_status not in allowed_transitions:
            raise WorkflowError(
                f"Invalid transition: cannot move from '{old_status}' to '{new_status}'. "
                f"Allowed transitions: {allowed_transitions or 'none'}"
            )

        # Check requisition status
        requisition = (
            db.query(Requisition)
            .filter(Requisition.req_id == locked_item.req_id)
            .one()
        )

        allowed, error = RequisitionPermissions.can_mutate_item(requisition)
        if not allowed:
            raise WorkflowError(error)

        # Update status
        locked_item.item_status = new_status

        # Recalculate header
        RequisitionWorkflowEngine.recalculate_header_status(
            db=db,
            req_id=locked_item.req_id,
            changed_by=performed_by,
        )

    # =========================================================================
    # VALIDATION HELPERS
    # =========================================================================

    @staticmethod
    def validate_can_create_item(
        db: Session,
        requisition: Requisition,
    ) -> None:
        """
        Validate that items can be created on this requisition.
        
        Raises:
            WorkflowError: If items cannot be created
        """
        allowed, error = RequisitionPermissions.can_modify_items(requisition)
        if not allowed:
            raise WorkflowError(error)

    # =========================================================================
    # INTERVIEW LOGGING (PHASE 4)
    # =========================================================================

    @staticmethod
    def log_interview_result(
        db: Session,
        item: RequisitionItem,
        interviewer_name: str,
        result: str,
        reason: str,
        performed_by: int,
    ) -> None:
        """
        Log an interview result for a requisition item.
        
        Must run inside transaction block.
        Does NOT auto-change status - use update_item_status() for transitions.
        
        Args:
            db: Database session
            item: RequisitionItem being interviewed
            interviewer_name: Name of interviewer (min 5 chars)
            result: Interview result (e.g., "PASS", "FAIL", "HOLD")
            reason: Reason/notes for result (min 5 chars)
            performed_by: ID of TA recording the result
            
        Raises:
            WorkflowError: If logging is not allowed
        """
        # Lock item
        locked_item = (
            db.query(RequisitionItem)
            .filter(RequisitionItem.item_id == item.item_id)
            .with_for_update()
            .one()
        )

        # Validate item status
        if locked_item.item_status != "Interviewing":
            raise WorkflowError(
                f"Cannot log interview result - item must be in 'Interviewing' status, "
                f"currently '{locked_item.item_status}'"
            )

        # Validate TA ownership
        if locked_item.assigned_ta != performed_by:
            raise WorkflowError(
                "Only the assigned TA can log interview results",
                status_code=403,
            )

        # Validate inputs
        interviewer_name = (interviewer_name or "").strip()
        if len(interviewer_name) < 5:
            raise WorkflowError("Interviewer name must be at least 5 characters")

        reason = (reason or "").strip()
        if len(reason) < 5:
            raise WorkflowError("Reason must be at least 5 characters")

        # Record activity event
        RequisitionEvents.log_audit(
            db=db,
            entity_name="requisition_item",
            entity_id=str(locked_item.item_id),
            action="INTERVIEW_RESULT",
            performed_by=performed_by,
            new_value={
                "item_id": locked_item.item_id,
                "req_id": locked_item.req_id,
                "interviewer_name": interviewer_name,
                "result": result,
                "reason": reason,
            },
        )

    # =========================================================================
    # SWAP OPERATIONS (PHASE 7)
    # =========================================================================

    @staticmethod
    def swap_ta_for_item(
        db: Session,
        item_id: int,
        new_ta_id: int,
        reason: str,
        current_user_id: int,
        current_user_roles: List[str],
    ) -> None:
        """
        Swap the TA assigned to a specific requisition item.
        
        Must run inside transaction block.
        Requires HR or Admin role.
        
        Args:
            db: Database session
            item_id: ID of the item to swap TA for
            new_ta_id: ID of the new TA user
            reason: Reason for the swap (min 5 chars)
            current_user_id: ID of user performing the swap
            current_user_roles: List of role names for current user
            
        Raises:
            WorkflowError: If swap is not allowed
        """
        # Enforce HR/Admin permission
        if "HR" not in current_user_roles and "Admin" not in current_user_roles:
            raise WorkflowError(
                "Only HR or Admin can swap TA assignments",
                status_code=403,
            )

        # Validate reason
        reason = (reason or "").strip()
        if len(reason) < 5:
            raise WorkflowError("Swap reason must be at least 5 characters")

        # Lock item
        locked_item = (
            db.query(RequisitionItem)
            .filter(RequisitionItem.item_id == item_id)
            .with_for_update()
            .one()
        )

        # Prevent swap if terminal status
        if locked_item.item_status in ("Fulfilled", "Cancelled"):
            raise WorkflowError(
                f"Cannot swap TA for item in '{locked_item.item_status}' status"
            )

        # Capture old TA
        old_ta_id = locked_item.assigned_ta

        # Perform swap
        locked_item.assigned_ta = new_ta_id

        # Record activity
        RequisitionEvents.log_audit(
            db=db,
            entity_name="requisition_item",
            entity_id=str(locked_item.item_id),
            action="ITEM_SWAPPED",
            performed_by=current_user_id,
            old_value={"assigned_ta": old_ta_id},
            new_value={
                "assigned_ta": new_ta_id,
                "reason": reason,
            },
        )

    @staticmethod
    def bulk_swap_ta(
        db: Session,
        requisition_id: int,
        old_ta_id: int,
        new_ta_id: int,
        reason: str,
        current_user_id: int,
        current_user_roles: List[str],
    ) -> int:
        """
        Bulk swap TA for all matching items on a requisition.
        
        Must run inside transaction block. Atomic operation.
        Requires HR or Admin role.
        
        Args:
            db: Database session
            requisition_id: ID of the requisition
            old_ta_id: ID of the current TA to replace
            new_ta_id: ID of the new TA
            reason: Reason for the swap (min 5 chars)
            current_user_id: ID of user performing the swap
            current_user_roles: List of role names for current user
            
        Returns:
            Number of items swapped
            
        Raises:
            WorkflowError: If swap is not allowed or no items found
        """
        # Enforce HR/Admin permission
        if "HR" not in current_user_roles and "Admin" not in current_user_roles:
            raise WorkflowError(
                "Only HR or Admin can swap TA assignments",
                status_code=403,
            )

        # Validate reason
        reason = (reason or "").strip()
        if len(reason) < 5:
            raise WorkflowError("Swap reason must be at least 5 characters")

        # Lock all matching items
        items = (
            db.query(RequisitionItem)
            .filter(
                RequisitionItem.req_id == requisition_id,
                RequisitionItem.assigned_ta == old_ta_id,
                RequisitionItem.item_status.notin_(["Fulfilled", "Cancelled"]),
            )
            .with_for_update()
            .all()
        )

        if not items:
            raise WorkflowError(
                "No eligible items found for TA swap",
                status_code=404,
            )

        # Update all items
        item_ids = []
        for item in items:
            item.assigned_ta = new_ta_id
            item_ids.append(item.item_id)

        # Record single bulk activity entry
        RequisitionEvents.log_audit(
            db=db,
            entity_name="requisition",
            entity_id=str(requisition_id),
            action="BULK_SWAP",
            performed_by=current_user_id,
            old_value={"assigned_ta": old_ta_id, "item_count": len(items)},
            new_value={
                "assigned_ta": new_ta_id,
                "item_ids": item_ids,
                "reason": reason,
            },
        )

        return len(items)
