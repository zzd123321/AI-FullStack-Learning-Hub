from sqlite3 import Connection as SQLiteConnection

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from .config import Settings

SessionFactory = sessionmaker[Session]


def build_engine(settings: Settings) -> Engine:
    sqlite = settings.database_url.startswith("sqlite")
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False} if sqlite else {},
        echo=settings.sql_echo,
        pool_pre_ping=True,
    )
    if sqlite:
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(dbapi_connection: object, _: object) -> None:
            if isinstance(dbapi_connection, SQLiteConnection):
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()
    return engine


def build_session_factory(engine: Engine) -> SessionFactory:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
