from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.auth import User, Role, UserRole
from db.models.user_employee_map import UserEmployeeMap
from db.models.employee import Employee

from schemas.user import UserCreate
from schemas.role import AssignRoleRequest
from schemas.user_employee import LinkUserEmployeeRequest

from utils.security import hash_password
from sqlalchemy import func

router = APIRouter(prefix="/users", tags=["Users"])

'''
# GET /users  → List users with roles
@router.get("/")
def get_users(db: Session = Depends(get_db)):
    results = (
        db.query(User, UserEmployeeMap.emp_id)
        .join(UserEmployeeMap)
        .all()
    )

    response = []
    for user, emp_id in results:
        response.append({
            "user_id": user.user_id,
            "username": user.username,
            "emp_id": emp_id,
            "is_active": user.is_active
        })

    return response
'''
@router.get("/")
def list_users(db: Session = Depends(get_db)):
    results = (
        db.query(
            User.user_id,
            User.username,
            User.is_active,
            UserEmployeeMap.emp_id,
            func.coalesce(func.array_agg(Role.role_name), []).label("roles")
        )
        .outerjoin(UserEmployeeMap, User.user_id == UserEmployeeMap.user_id)
        .outerjoin(UserRole, User.user_id == UserRole.user_id)
        .outerjoin(Role, Role.role_id == UserRole.role_id)
        .group_by(User.user_id, UserEmployeeMap.emp_id)
        .all()
    )

    response = []
    for row in results:
        response.append({
            "user_id": row.user_id,
            "username": row.username,
            "emp_id": row.emp_id,      # None if user not linked to employee
            "is_active": row.is_active,
            "roles": row.roles         # [] if no roles
        })

    return response

# ------------------------------------------------------------------
# POST /users  → Create user
# ------------------------------------------------------------------
@router.post("/")
def create_user(payload: UserCreate, db: Session = Depends(get_db)):

    # bcrypt hard limit: 72 BYTES
    if len(payload.password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="Password too long (maximum 72 bytes)"
        )

    existing_user = (
        db.query(User)
        .filter(User.username == payload.username)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

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


# ------------------------------------------------------------------
# POST /users/{user_id}/roles  → Assign role
# ------------------------------------------------------------------
@router.post("/{user_id}/roles")
def assign_role_to_user(
    user_id: int,
    payload: AssignRoleRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role = db.query(Role).filter(Role.role_name == payload.role_name).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

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

    user_role = UserRole(
        user_id=user_id,
        role_id=role.role_id
    )

    db.add(user_role)
    db.commit()

    return {
        "message": "Role assigned successfully"
    }


# ------------------------------------------------------------------
# POST /users/link-employee  → Link user to employee
# ------------------------------------------------------------------
@router.post("/link-employee")
def link_user_employee(
    payload: LinkUserEmployeeRequest,
    db: Session = Depends(get_db)
):
    # 1. Validate user exists
    user = db.query(User).filter(User.user_id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # 2. Validate employee exists
    employee = db.query(Employee).filter(Employee.emp_id == payload.emp_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # 3. Check user already linked
    existing_user_link = (
        db.query(UserEmployeeMap)
        .filter(UserEmployeeMap.user_id == payload.user_id)
        .first()
    )
    if existing_user_link:
        raise HTTPException(status_code=400, detail="User already linked to employee")

    # 4. Check employee already linked
    existing_emp_link = (
        db.query(UserEmployeeMap)
        .filter(UserEmployeeMap.emp_id == payload.emp_id)
        .first()
    )
    if existing_emp_link:
        raise HTTPException(status_code=400, detail="Employee already linked to a user")

    # 5. Create mapping
    link = UserEmployeeMap(
        user_id=payload.user_id,
        emp_id=payload.emp_id
    )

    db.add(link)
    db.commit()

    return {"message": "User successfully linked to employee"}