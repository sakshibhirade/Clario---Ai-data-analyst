import re
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Header, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ...database.connection import get_db
from ...database.models import ClarioUser
from ...services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    generate_reset_token,
)

router = APIRouter()

EMAIL_REGEX = re.compile(r"^[\w\.-]+@([\w-]+\.)+[\w-]{2,4}$")

def validate_email_format(email: str) -> str:
    cleaned = email.strip().lower()
    if not EMAIL_REGEX.match(cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address."
        )
    return cleaned


# ---------------------------------------------------------
# Request / Response Schemas
# ---------------------------------------------------------

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str
    remember_me: Optional[bool] = False


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=6, max_length=128)


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    avatar_initials: Optional[str] = Field(None, max_length=10)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=128)


class UpdatePreferencesRequest(BaseModel):
    preferences: Dict[str, Any]


# ---------------------------------------------------------
# Auth Dependency: Get Current User
# ---------------------------------------------------------

def get_current_user(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> ClarioUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload["sub"]
    user = db.query(ClarioUser).filter(ClarioUser.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


# ---------------------------------------------------------
# Helper: Ensure Demo Account Exists
# ---------------------------------------------------------

def ensure_demo_user(db: Session) -> ClarioUser:
    demo_email = "demo@clario.dev"
    user = db.query(ClarioUser).filter(ClarioUser.email == demo_email).first()
    if not user:
        user = ClarioUser(
            id=str(uuid.uuid4()),
            full_name="Demo Analyst",
            email=demo_email,
            hashed_password=hash_password("demo1234"),
            avatar_initials="DA",
            preferences={
                "theme": "system",
                "notifications_enabled": True,
                "remember_last_ds": True,
                "default_datasource_id": None
            }
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


# ---------------------------------------------------------
# Endpoints
# ---------------------------------------------------------

@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    clean_email = validate_email_format(req.email)
    existing = db.query(ClarioUser).filter(ClarioUser.email == clean_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )

    # Compute initials from name
    parts = req.full_name.strip().split()
    initials = "".join([p[0].upper() for p in parts[:2]]) if parts else "CL"

    user = ClarioUser(
        id=str(uuid.uuid4()),
        full_name=req.full_name.strip(),
        email=clean_email,
        hashed_password=hash_password(req.password),
        avatar_initials=initials,
        preferences={
            "theme": "system",
            "notifications_enabled": True,
            "remember_last_ds": True,
            "default_datasource_id": None
        }
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email})
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": user.to_dict()
    }


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    clean_email = validate_email_format(req.email)

    # If demo email requested and doesn't exist, seed it
    if clean_email == "demo@clario.dev":
        ensure_demo_user(db)

    user = db.query(ClarioUser).filter(ClarioUser.email == clean_email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email address or password."
        )

    # If remember me is requested, grant 30-day expiry, else 7 days
    delta = timedelta(days=30) if req.remember_me else timedelta(days=7)
    token = create_access_token({"sub": user.id, "email": user.email}, expires_delta=delta)

    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": user.to_dict()
    }


@router.post("/demo-login")
def demo_login(db: Session = Depends(get_db)):
    """Fast login endpoint for the 'Explore Demo' button."""
    user = ensure_demo_user(db)
    token = create_access_token({"sub": user.id, "email": user.email}, expires_delta=timedelta(days=7))
    return {
        "status": "success",
        "access_token": token,
        "token_type": "bearer",
        "user": user.to_dict()
    }


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    clean_email = validate_email_format(req.email)
    user = db.query(ClarioUser).filter(ClarioUser.email == clean_email).first()
    if not user:
        # Don't reveal user existence for external probes, but return clean message
        return {
            "status": "success",
            "message": "If an account with that email exists, reset instructions have been generated.",
            "reset_token": None
        }

    reset_token = generate_reset_token()
    user.reset_token = reset_token
    user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()

    return {
        "status": "success",
        "message": "Password reset token generated successfully.",
        "reset_token": reset_token,
        "expires_in_minutes": 60
    }


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(ClarioUser).filter(ClarioUser.reset_token == req.token).first()
    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token."
        )

    user.hashed_password = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    db.commit()

    return {
        "status": "success",
        "message": "Password has been reset successfully. You can now sign in with your new password."
    }


@router.get("/me")
def get_me(user: ClarioUser = Depends(get_current_user)):
    return {
        "status": "success",
        "user": user.to_dict()
    }


@router.patch("/profile")
def update_profile(
    req: UpdateProfileRequest,
    user: ClarioUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if req.full_name is not None and req.full_name.strip():
        user.full_name = req.full_name.strip()
    if req.avatar_initials is not None:
        user.avatar_initials = req.avatar_initials.strip().upper()[:5]

    db.commit()
    db.refresh(user)
    return {
        "status": "success",
        "user": user.to_dict()
    }


@router.patch("/change-password")
def change_password(
    req: ChangePasswordRequest,
    user: ClarioUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not verify_password(req.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The current password you entered is incorrect."
        )

    user.hashed_password = hash_password(req.new_password)
    db.commit()
    return {
        "status": "success",
        "message": "Password updated successfully."
    }


@router.patch("/preferences")
def update_preferences(
    req: UpdatePreferencesRequest,
    user: ClarioUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    current_prefs = dict(user.preferences or {})
    current_prefs.update(req.preferences)
    user.preferences = current_prefs
    flag_modified(user, "preferences")

    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "status": "success",
        "preferences": user.preferences,
        "user": user.to_dict()
    }


@router.post("/logout")
def logout():
    return {
        "status": "success",
        "message": "Logged out successfully"
    }
