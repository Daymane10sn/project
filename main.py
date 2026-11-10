import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal

import bcrypt
import jwt
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field, StringConstraints, field_validator
from sqlalchemy import DateTime, ForeignKey, String, Text, create_engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    selectinload,
    sessionmaker,
)

# ---------- Настройки ----------
BASE_DIR = Path(__file__).resolve().parent

def database_url() -> str:
    """DATABASE_URL (Postgres на Render) -> иначе SQLite-файл (DB_PATH или app.db рядом с main.py)."""
    url = os.getenv("DATABASE_URL")
    if url:
        # Render отдаёт postgres:// или postgresql://, а SQLAlchemy с драйвером psycopg 3 ждёт postgresql+psycopg://
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url
    return f"sqlite:///{Path(os.getenv('DB_PATH', BASE_DIR / 'app.db')).as_posix()}"


DATABASE_URL = database_url()
ALGORITHM = "HS256"
TOKEN_TTL_MINUTES = 60 * 24  # токен живёт сутки


def load_secret_key() -> str:
    """SECRET_KEY из переменной окружения, иначе случайный ключ, сохранённый в .secret_key."""
    env = os.getenv("SECRET_KEY")
    if env:
        return env
    key_file = BASE_DIR / ".secret_key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_urlsafe(48)
    key_file.write_text(key)
    return key


SECRET_KEY = load_secret_key()

# ---------- База данных ----------
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(50), index=True)
    body: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    author: Mapped[User] = relationship()
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="topic", order_by="Comment.id", cascade="all, delete-orphan"
    )


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    topic: Mapped[Topic] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


# create_all только добавляет недостающие таблицы (topics, comments); users и её данные не трогает
Base.metadata.create_all(engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Схемы ----------
Trimmed = Annotated[str, StringConstraints(strip_whitespace=True)]
Category = Literal["Учёба", "Документы", "Общежитие", "Студенческая жизнь", "Другое"]


class RegisterIn(BaseModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=50)]
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, v: str) -> str:
        if len(v.encode()) > 72:  # bcrypt принимает максимум 72 байта (кириллица — 2 байта на букву)
            raise ValueError("Пароль слишком длинный")
        return v


class LoginIn(BaseModel):
    email: Trimmed
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str

    model_config = {"from_attributes": True}


class TopicIn(BaseModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)]
    category: Category
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=30, max_length=20000)]


class CommentIn(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


# ---------- Безопасность ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    raw = password.encode()
    if len(raw) > 72:
        return False
    try:
        return bcrypt.checkpw(raw, password_hash.encode())
    except ValueError:  # битый хеш в БД
        return False


def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


bearer = HTTPBearer(auto_error=False)


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Нужно войти в аккаунт")
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Сессия истекла, войди снова")
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Пользователь не найден")
    return user


def auth_response(user: User) -> dict:
    return {
        "access_token": create_token(user.id),
        "token_type": "bearer",
        "user": UserOut.model_validate(user).model_dump(),
    }


# ---------- Форум: сериализация ----------
def ms(dt: datetime) -> int:
    """datetime -> миллисекунды (так время ждёт фронтенд). SQLite отдаёт naive-время в UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def topic_dict(t: Topic, comments_count: int) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "category": t.category,
        "body": t.body,
        "author": t.author.username,
        "created": ms(t.created_at),
        "comments_count": comments_count,
    }


def topic_detail(t: Topic) -> dict:
    d = topic_dict(t, len(t.comments))
    d["comments"] = [
        {"author": c.author.username, "body": c.body, "created": ms(c.created_at)} for c in t.comments
    ]
    return d


def load_topic(db: Session, topic_id: int) -> Topic | None:
    return db.scalar(
        select(Topic)
        .options(selectinload(Topic.author), selectinload(Topic.comments).selectinload(Comment.author))
        .where(Topic.id == topic_id)
    )


# ---------- Приложение ----------
app = FastAPI(title="Навигатор первокурсника")


@app.post("/api/register", status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(func.lower(User.email) == data.email.lower())):
        raise HTTPException(400, "Этот email уже зарегистрирован")
    if db.scalar(select(User).where(func.lower(User.username) == data.username.lower())):
        raise HTTPException(400, "Это имя уже занято — выбери другое")
    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # гонка: кто-то успел зарегистрироваться с теми же данными
        db.rollback()
        raise HTTPException(400, "Такое имя или email уже заняты")
    db.refresh(user)
    return auth_response(user)


@app.post("/api/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Неверный email или пароль")
    return auth_response(user)


@app.get("/api/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


# ---------- Форум: читать могут все, писать — только вошедшие ----------
@app.get("/api/topics")
def list_topics(db: Session = Depends(get_db)):
    rows = db.execute(
        select(Topic, func.count(Comment.id))
        .outerjoin(Comment, Comment.topic_id == Topic.id)
        .options(selectinload(Topic.author))
        .group_by(Topic.id)
        .order_by(Topic.created_at.desc(), Topic.id.desc())
    ).all()
    return [topic_dict(t, n) for t, n in rows]


@app.get("/api/topics/{topic_id}")
def get_topic(topic_id: int, db: Session = Depends(get_db)):
    t = load_topic(db, topic_id)
    if not t:
        raise HTTPException(404, "Тема не найдена")
    return topic_detail(t)


@app.post("/api/topics", status_code=201)
def create_topic(data: TopicIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = Topic(title=data.title, category=data.category, body=data.body, author_id=user.id)
    db.add(t)
    db.commit()
    return topic_detail(load_topic(db, t.id))


@app.post("/api/topics/{topic_id}/comments", status_code=201)
def add_comment(
    topic_id: int, data: CommentIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    if not db.get(Topic, topic_id):
        raise HTTPException(404, "Тема не найдена")
    db.add(Comment(topic_id=topic_id, author_id=user.id, body=data.body))
    db.commit()
    return topic_detail(load_topic(db, topic_id))


# ---------- Фронтенд (самым последним, чтобы не перекрывать /api) ----------
PUBLIC_FILES = {"index.html", "styles.css", "app.js", "api.js", "components.js", "data.js", "pages.js", "logo-mark.png"}


@app.get("/")
def index():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/{name}")
def public_file(name: str):
    # отдаём только файлы сайта из белого списка (main.py и база наружу не попадают)
    if name not in PUBLIC_FILES:
        raise HTTPException(404, "Not found")
    return FileResponse(BASE_DIR / name)
