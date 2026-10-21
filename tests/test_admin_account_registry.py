import json
import os
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "local-admin-registry-test-secret-32")
os.environ.setdefault("DATABASE_URL", f"sqlite:////tmp/aeromind-admin-registry-{os.getpid()}.db")

from sqlalchemy import select
from web.admin import account_for_email, account_for_identity, create_account, list_accounts, migrate_legacy_registry, update_account, verify_authorization_code
from web.database import Base, SessionLocal, engine
from web.models import AdminAccountEvent, AdminAccountRecord


class AdminAccountRegistryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)

    def test_create_and_authorize_only_a_preexisting_allowlisted_identity(self):
        email = f"entra-{uuid4()}@example.test"
        actor = {"id": "admin-test", "email": "admin@example.test", "role": "super_admin"}
        created = create_account(actor, email.upper(), "Entra Demo", "demo", "L2")
        self.assertEqual(created["email"], email)
        self.assertTrue(created["entraAccountRequired"])
        self.assertEqual(created["loginMethod"], "microsoft-entra-existing-account-required")
        self.assertTrue(verify_authorization_code(email, created["authorizationCode"]))
        self.assertIsNotNone(account_for_identity(email, "verified-entra-subject"))
        self.assertIsNone(account_for_identity(f"unlisted-{uuid4()}@example.test", "unknown-subject"))
        self.assertEqual(account_for_email(email)["role"], "demo")
        self.assertTrue(any(item["email"] == email for item in list_accounts()))
        with SessionLocal() as db:
            row = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.email == email))
            self.assertIsNotNone(row)
            self.assertIn("authorizationCodeHash", json.loads(row.data_json))
            self.assertNotIn("authorizationCodeHash", created)
            event = db.scalar(select(AdminAccountEvent).where(AdminAccountEvent.target_user_id == created["id"]))
            self.assertEqual(event.event_type, "account.created")
        update_account(actor, created["id"], {"accountStatus": "suspended"})
        self.assertIsNone(account_for_identity(email, "verified-entra-subject"))

    def test_imports_legacy_json_once_then_archives_it(self):
        email = f"legacy-{uuid4()}@example.test"
        account_id = str(uuid4())
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            accounts_file, events_file, deleted_file = root / "accounts.json", root / "admin_events.json", root / "deleted_accounts.json"
            accounts_file.write_text(json.dumps([{"id": account_id, "email": email, "name": "Legacy", "role": "user", "accountStatus": "active", "level": "L1", "authorizationCodeHash": "legacy-hash"}]), encoding="utf-8")
            events_file.write_text(json.dumps([{"id": str(uuid4()), "eventType": "account.created", "actorId": "legacy-admin", "actorEmail": "admin@example.test", "targetUserId": account_id, "payloadJson": "{}", "createdAt": "2026-10-20T00:00:00+00:00"}]), encoding="utf-8")
            from unittest.mock import patch
            with patch("web.admin._ACCOUNTS_FILE", accounts_file), patch("web.admin._EVENTS_FILE", events_file), patch("web.admin._DELETED_ACCOUNTS_FILE", deleted_file):
                first = migrate_legacy_registry()
                self.assertEqual(first, {"accounts": 1, "events": 1})
                self.assertFalse(accounts_file.exists())
                self.assertTrue(Path(str(accounts_file) + ".migrated").exists())
                second = migrate_legacy_registry()
                self.assertEqual(second, {"accounts": 0, "events": 0})
        self.assertEqual(account_for_email(email)["authorizationCodeHash"], "legacy-hash")
        self.assertIsNotNone(account_for_identity(email, "legacy-entra-subject"))


if __name__ == "__main__":
    unittest.main()
