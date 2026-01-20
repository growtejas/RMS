from schemas.role import AssignRoleRequest

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from db.models.auth import User, Role, UserRole
from schemas.user import UserCreate
from utils.security import hash_password
from fastapi import HTTPException


router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/")
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()

    response = []

    for user in users:
        roles = (
            db.query(Role.role_name)
            .join(UserRole, Role.role_id == UserRole.role_id)
            .filter(UserRole.user_id == user.user_id)
            .all()
        )

        response.append({
            "username": user.username,
            "is_active": user.is_active,
            "roles": [r[0] for r in roles]
        })

@router.post("/")
def create_user(payload: UserCreate, db: Session = Depends(get_db)):

    # 🔒 bcrypt hard limit: 72 BYTES (not characters)
    if len(payload.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="Password too long (maximum 72 bytes)"
        )

    # Check if username exists
    existing_user = db.query(User).filter(User.username == payload.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already exists")

    # Hash password
    hashed_password = hash_password(payload.password)

    new_user = User(
        username=payload.username,
        password_hash=hashed_password,
        is_active=True
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "User created successfully",
        "user_id": new_user.user_id
    }

@router.post("/{user_id}/roles")
def assign_role_to_user(
    user_id: int,
    payload: AssignRoleRequest,
    db: Session = Depends(get_db)
):
    # 1. Check user exists
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2. Check role exists
    role = db.query(Role).filter(Role.role_name == payload.role_name).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    # 3. Check if role already assigned
    existing_assignment = (
        db.query(UserRole)
        .filter(
            UserRole.user_id == user_id,
            UserRole.role_id == role.role_id
        )
        .first()
    )

    if existing_assignment:
        raise HTTPException(
            status_code=400,
            detail="Role already assigned to user"
        )

    # 4. Assign role
    user_role = UserRole(
        user_id=user_id,
        role_id=role.role_id
    )

    db.add(user_role)
    db.commit()

    return {
        "message": "Role assigned successfully"
    }

    return response
