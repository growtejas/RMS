"""
RBAC Dependencies for FastAPI routes.
Use these dependencies to protect endpoints based on user roles.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import List, Optional

from db.session import get_db
from db.models.auth import User, Role, UserRole
from utils.jwt import verify_token

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency to get the current authenticated user from JWT token.
    
    Usage:
        @router.get("/protected")
        def protected_route(current_user: User = Depends(get_current_user)):
            return {"user_id": current_user.user_id}
    """
    token = credentials.credentials
    payload = verify_token(token)
    
    user_id: Optional[int] = int(payload.get("sub"))
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    return user


def get_current_user_roles(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List[str]:
    """
    Dependency to get the current user's roles.
    
    Usage:
        @router.get("/admin-only")
        def admin_route(roles: List[str] = Depends(get_current_user_roles)):
            if "Admin" not in roles:
                raise HTTPException(403, "Admin access required")
    """
    roles_result = (
        db.query(Role.role_name)
        .join(UserRole, Role.role_id == UserRole.role_id)
        .filter(UserRole.user_id == current_user.user_id)
        .all()
    )
    return [role[0] for role in roles_result]


def require_role(required_role: str):
    """
    Dependency factory to require a specific role.
    
    Usage:
        @router.get("/hr-only")
        def hr_route(user: User = Depends(require_role("HR"))):
            return {"message": "HR access granted"}
    """
    def role_checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> User:
        roles_result = (
            db.query(Role.role_name)
            .join(UserRole, Role.role_id == UserRole.role_id)
            .filter(UserRole.user_id == current_user.user_id)
            .all()
        )
        user_roles = [role[0] for role in roles_result]
        
        if required_role not in user_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {required_role}"
            )
        
        return current_user
    
    return role_checker


def require_any_role(*required_roles: str):
    """
    Dependency factory to require any one of the specified roles.
    
    Usage:
        @router.get("/hr-or-admin")
        def hr_or_admin_route(user: User = Depends(require_any_role("HR", "Admin"))):
            return {"message": "Access granted"}
    """
    def role_checker(
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> User:
        roles_result = (
            db.query(Role.role_name)
            .join(UserRole, Role.role_id == UserRole.role_id)
            .filter(UserRole.user_id == current_user.user_id)
            .all()
        )
        user_roles = [role[0] for role in roles_result]
        
        if not any(role in user_roles for role in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required one of: {', '.join(required_roles)}"
            )
        
        return current_user
    
    return role_checker


def validate_status_transition(current_status: str, new_status: str) -> None:
    """
    Validate requisition status transitions.

    Allowed transitions:
    Pending Budget Approval -> Pending HR Approval or Rejected
    Pending HR Approval -> Approved & Unassigned or Rejected
    Approved & Unassigned -> Active
    Active -> Closed
    """
    allowed_transitions = {
        "Pending Budget Approval": {"Pending HR Approval", "Rejected"},
        "Pending HR Approval": {"Approved & Unassigned", "Rejected"},
        "Approved & Unassigned": {"Active"},
        "Active": {"Closed"},
    }

    if current_status == new_status:
        return

    if new_status not in allowed_transitions.get(current_status, set()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid status transition: {current_status} -> {new_status}"
            ),
        )
