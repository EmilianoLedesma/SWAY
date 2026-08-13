from typing import Optional

from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    username: str
    password: str


class PostulationIn(BaseModel):
    id: str
    company: str
    role: str
    location: Optional[str] = ""
    salary: Optional[str] = ""
    schedule: Optional[str] = ""
    date_applied: Optional[str] = ""
    source: Optional[str] = ""
    requirements: Optional[str] = ""
    notes: Optional[str] = ""
    status: str = "postulado"


class PostulationUpdate(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None
    schedule: Optional[str] = None
    date_applied: Optional[str] = None
    source: Optional[str] = None
    requirements: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class ContactMessage(BaseModel):
    name: str
    email: EmailStr
    message: str
