from datetime import datetime, timezone
from uuid import UUID, uuid4

from .models import DocumentRecord, UserRecord


class DuplicateUsernameError(Exception):
    pass


class InMemoryUserRepository:
    def __init__(self) -> None:
        self.by_id: dict[UUID, UserRecord] = {}
        self.by_username: dict[str, UserRecord] = {}

    def create(self, username: str, password_hash: str) -> UserRecord:
        key = username.casefold()
        if key in self.by_username:
            raise DuplicateUsernameError
        user = UserRecord(id=uuid4(), username=username, password_hash=password_hash)
        self.by_id[user.id] = user
        self.by_username[key] = user
        return user

    def find_by_username(self, username: str) -> UserRecord | None:
        return self.by_username.get(username.casefold())

    def get(self, user_id: UUID) -> UserRecord | None:
        return self.by_id.get(user_id)


class InMemoryDocumentRepository:
    def __init__(self) -> None:
        self.records: dict[int, DocumentRecord] = {}
        self.next_id = 1

    def create(self, owner_id: UUID, title: str) -> DocumentRecord:
        record = DocumentRecord(id=self.next_id, owner_id=owner_id, title=title)
        self.records[record.id] = record
        self.next_id += 1
        return record

    def get(self, document_id: int) -> DocumentRecord | None:
        return self.records.get(document_id)


class RevokedTokenStore:
    def __init__(self) -> None:
        self.expires_by_jti: dict[str, datetime] = {}

    def revoke(self, jti: str, expires_at: datetime) -> None:
        self.expires_by_jti[jti] = expires_at

    def contains(self, jti: str) -> bool:
        expires_at = self.expires_by_jti.get(jti)
        if expires_at is None:
            return False
        if expires_at <= datetime.now(timezone.utc):
            del self.expires_by_jti[jti]
            return False
        return True
