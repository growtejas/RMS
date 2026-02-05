from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from db.models.auth import User
from utils.dependencies import require_any_role
from utils.storage import StorageService, get_jd_storage_service

router = APIRouter(prefix="/uploads", tags=["Uploads"])

ALLOWED_CONTENT_TYPES = {"application/pdf", "text/plain"}
MAX_FILE_SIZE = 10 * 1024 * 1024


@router.post("/jd")
async def upload_jd(
    file: UploadFile = File(...),
    storage: StorageService = Depends(get_jd_storage_service),
    current_user: User = Depends(require_any_role("HR", "Admin", "Manager", "Employee")),
):
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Invalid file type")

    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10MB")

    ext = ".pdf" if file.content_type == "application/pdf" else ".txt"
    filename = f"{uuid4().hex}{ext}"

    file_key = storage.save(file, filename)
    file_url = storage.get_url(file_key)

    return {"file_url": file_url}
