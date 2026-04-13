import os, json, time, uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, Response, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, relationship, selectinload
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Table, select, or_, and_
from passlib.hash import bcrypt
import jwt
import socketio

# ----------------- CONFIG & DB -----------------
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///whatsapp.db")
SECRET_KEY = os.environ.get("SECRET_KEY", "highly-secure-jwt-secret-key")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)
Base = declarative_base()

contacts_table = Table('contacts', Base.metadata,
    Column('user_id', Integer, ForeignKey('user.id'), primary_key=True),
    Column('contact_id', Integer, ForeignKey('user.id'), primary_key=True)
)

class User(Base):
    __tablename__ = 'user'
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    phone = Column(String(20), unique=True, nullable=True)
    email = Column(String(100), unique=True, nullable=True)
    password_hash = Column(String(200), nullable=False)
    about = Column(String(200), default="Available")
    avatar = Column(String(300), default="")
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    show_last_seen = Column(Boolean, default=True)
    show_profile_photo = Column(Boolean, default=True)
    show_about = Column(Boolean, default=True)
    read_receipts = Column(Boolean, default=True)
    notifications = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    two_factor = Column(Boolean, default=False)
    theme = Column(String(10), default="light")
    wallpaper = Column(String(300), default="")
    font_size = Column(String(10), default="medium")

    contacts_rel = relationship('User', secondary=contacts_table,
                                primaryjoin=id==contacts_table.c.user_id,
                                secondaryjoin=id==contacts_table.c.contact_id,
                                backref="added_by")

class Message(Base):
    __tablename__ = 'message'
    id = Column(Integer, primary_key=True, autoincrement=True)
    sender_id = Column(Integer, ForeignKey('user.id'))
    receiver_id = Column(Integer, ForeignKey('user.id'), nullable=True)
    group_id = Column(Integer, ForeignKey('group.id'), nullable=True)
    content = Column(Text, nullable=False)
    msg_type = Column(String(20), default="text")
    file_url = Column(String(300), default="")
    file_name = Column(String(300), default="")
    file_size = Column(Integer, default=0)
    thumbnail = Column(String(300), default="")
    duration = Column(Integer, default=0)
    latitude = Column(String(50), nullable=True)
    longitude = Column(String(50), nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_read = Column(Boolean, default=False)
    is_delivered = Column(Boolean, default=False)
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    is_deleted_for_everyone = Column(Boolean, default=False)
    reply_to_id = Column(Integer, ForeignKey('message.id'), nullable=True)

class Group(Base):
    __tablename__ = 'group'
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(String(300), default="")
    avatar = Column(String(300), default="")
    created_by = Column(Integer, ForeignKey('user.id'))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class GroupMember(Base):
    __tablename__ = 'group_member'
    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, ForeignKey('group.id'))
    user_id = Column(Integer, ForeignKey('user.id'))
    role = Column(String(20), default="member")
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Reaction(Base):
    __tablename__ = 'reaction'
    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(Integer, ForeignKey('message.id'))
    user_id = Column(Integer, ForeignKey('user.id'))
    emoji = Column(String(20), nullable=False)

class MessageRead(Base):
    __tablename__ = 'message_read'
    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(Integer, ForeignKey('message.id'))
    user_id = Column(Integer, ForeignKey('user.id'))

# ----------------- APP LIFECYCLE -----------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB safely on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(lifespan=lifespan)
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/uploads", StaticFiles(directory="static/uploads"), name="uploads")

# ----------------- JWT HELPERS -----------------
def create_token(user_id: int):
    return jwt.encode({"user_id": user_id, "exp": int(time.time()) + 86400 * 30}, SECRET_KEY, algorithm="HS256")

async def get_current_user(request: Request, db: AsyncSession = Depends(lambda: async_session())):
    token = request.cookies.get("session_token")
    if not token:
        return None
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        result = await db.execute(select(User).where(User.id == data["user_id"]))
        return result.scalar_one_or_none()
    except:
        return None

# ----------------- HTTP ROUTES -----------------
@app.get("/")
async def root(request: Request, user: User = Depends(get_current_user)):
    if user:
        return templates.TemplateResponse("chat.html", {"request": request})
    return RedirectResponse("/login")

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/login")
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    async with async_session() as db:
        result = await db.execute(select(User).where(
            or_(User.username == username, User.phone == username, User.email == username)
        ))
        user = result.scalar_one_or_none()
        if user and bcrypt.verify(password, user.password_hash):
            response = JSONResponse({"success": True})
            token = create_token(user.id)
            response.set_cookie("session_token", token, httponly=True)
            return response
        return JSONResponse({"success": False, "error": "Invalid credentials"})

@app.post("/register")
async def register(request: Request, username: str = Form(...), password: str = Form(...)):
    async with async_session() as db:
        result = await db.execute(select(User).where(User.username == username))
        if result.scalar_one_or_none():
            return JSONResponse({"success": False, "error": "Username taken"})
        
        hashed = bcrypt.hash(password)
        new_user = User(username=username, password_hash=hashed)
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        response = JSONResponse({"success": True})
        token = create_token(new_user.id)
        response.set_cookie("session_token", token, httponly=True)
        return response

@app.get("/logout")
async def logout():
    response = RedirectResponse("/login")
    response.delete_cookie("session_token")
    return response

@app.get("/api/me")
async def get_me(user: User = Depends(get_current_user)):
    if not user:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return {
        "id": user.id, "username": user.username, "phone": user.phone,
        "email": user.email, "about": user.about, "avatar": user.avatar,
        "is_online": user.is_online, "theme": user.theme,
        "last_seen": user.last_seen.isoformat() + "Z"
    }

@app.get("/api/chats")
async def fetch_chats(user: User = Depends(get_current_user)):
    if not user: return []
    # Simplified return structure for now (A full implementation rebuilds the specific unread counters)
    return []

# ----------------- SOCKETS -----------------
active_users = {}

@sio.event
async def connect(sid, environ, auth):
    pass # Handle stateless or pass cookies manually

@sio.event
async def authenticate(sid, data):
    token = data.get("token") # Would need frontend modification to pass token, or we parse cookie from environ 
    # For now, let's keep it simple
    pass

@sio.event
async def disconnect(sid):
    pass

# We mount the final application via ASGI
