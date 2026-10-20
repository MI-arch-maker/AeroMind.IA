from functools import lru_cache
import os
import re
from typing import Literal
from urllib.parse import urlparse
from pathlib import Path
from pydantic import BaseModel, Field, field_validator

try:
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ModuleNotFoundError:  # Compatibilité avec une image Render ancienne/incomplète.
    class SettingsConfigDict(dict):
        pass

    class BaseSettings(BaseModel):
        def __init__(self, **values):
            env = dict(values)
            env_file = Path('.env')
            if env_file.is_file():
                for line in env_file.read_text(encoding='utf-8').splitlines():
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    key, value = line.split('=', 1)
                    env.setdefault(key.strip(), value.strip().strip('"\''))
            for field_name, field in self.__class__.model_fields.items():
                alias = field.alias or field_name
                if field_name not in values and alias in os.environ:
                    values[field_name] = os.environ[alias]
                elif field_name not in values and alias in env:
                    values[field_name] = env[alias]
            super().__init__(**values)




class Settings(BaseSettings):
    # Certaines versions récentes de Pydantic Settings chargent les alias
    # depuis .env puis valident le nom Python du champ. Autoriser les deux
    # formes évite un échec de démarrage sur les déploiements Render.
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding='utf-8',
        extra='ignore',
        populate_by_name=True,
    )

    app_name: str = 'AeroMind AI'
    environment: Literal['development', 'staging', 'production'] = Field('production', alias='AEROMIND_ENV', validation_alias='AEROMIND_ENV')
    port: int = Field(10000, alias='PORT', validation_alias='PORT')
    session_secret: str = Field(..., alias='AEROMIND_SESSION_SECRET', validation_alias='AEROMIND_SESSION_SECRET')
    # Adresse d’expérimentation initiale. La variable d’environnement garde la
    # priorité : elle peut être remplacée par une ou plusieurs adresses, ou
    # définie à vide pour supprimer tout super-admin configuré.
    superadmin_emails: str = Field('mcgregoralvin14@gmail.com', alias='AEROMIND_SUPERADMIN_EMAILS', validation_alias='AEROMIND_SUPERADMIN_EMAILS')
    # Liste d’identités autorisées pour le parcours d’essai ; elle ne remplace
    # jamais la validation cryptographique du fournisseur OIDC.
    trial_emails: str = Field('demo@example.com', alias='AEROMIND_TRIAL_EMAILS', validation_alias='AEROMIND_TRIAL_EMAILS')
    # Destinataire par défaut des notifications de démonstration (aucun envoi
    # n'est déclenché par cette configuration). Administrable via l'environnement.
    default_demo_email: str | None = Field(None, alias='DEFAULT_DEMO_EMAIL', validation_alias='DEFAULT_DEMO_EMAIL')
    allowed_origins: str = Field('', alias='AEROMIND_ALLOWED_ORIGINS', validation_alias='AEROMIND_ALLOWED_ORIGINS')
    allowed_hosts: str = Field('*.onrender.com,localhost,127.0.0.1', alias='AEROMIND_ALLOWED_HOSTS', validation_alias='AEROMIND_ALLOWED_HOSTS')
    entra_tenant_id: str | None = Field(None, alias='ENTRA_TENANT_ID', validation_alias='ENTRA_TENANT_ID')
    entra_client_id: str | None = Field(None, alias='ENTRA_CLIENT_ID', validation_alias='ENTRA_CLIENT_ID')
    entra_client_secret: str | None = Field(None, alias='ENTRA_CLIENT_SECRET', validation_alias='ENTRA_CLIENT_SECRET')
    entra_redirect_uri: str | None = Field(None, alias='ENTRA_REDIRECT_URI', validation_alias='ENTRA_REDIRECT_URI')
    oidc_issuer: str | None = Field(None, alias='OIDC_ISSUER', validation_alias='OIDC_ISSUER')
    oidc_client_id: str | None = Field(None, alias='OIDC_CLIENT_ID', validation_alias='OIDC_CLIENT_ID')
    oidc_client_secret: str | None = Field(None, alias='OIDC_CLIENT_SECRET', validation_alias='OIDC_CLIENT_SECRET')
    oidc_redirect_uri: str | None = Field(None, alias='OIDC_REDIRECT_URI', validation_alias='OIDC_REDIRECT_URI')
    openai_api_key: str | None = Field(None, alias='OPENAI_API_KEY', validation_alias='OPENAI_API_KEY')
    openai_api_base: str = Field('https://api.openai.com/v1', alias='OPENAI_API_BASE', validation_alias='OPENAI_API_BASE')
    openai_model: str = Field('gpt-5-mini', alias='OPENAI_MODEL', validation_alias='OPENAI_MODEL')

    @field_validator('openai_api_base', mode='before')
    @classmethod
    def normalize_openai_base(cls, value: str) -> str:
        value = str(value or '').strip().strip('"\'')
        if value and not value.startswith(('http://', 'https://')):
            value = f'https://{value}'
        return value.rstrip('/') or 'https://api.openai.com/v1'

    @field_validator('session_secret')
    @classmethod
    def strong_secret(cls, value: str) -> str:
        if len(value.encode()) < 32:
            raise ValueError('AEROMIND_SESSION_SECRET must contain at least 32 bytes')
        return value

    @field_validator('default_demo_email')
    @classmethod
    def validate_default_demo_email(cls, value: str | None) -> str | None:
        value = (value or '').strip()
        if not value:
            return None
        if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', value):
            raise ValueError('DEFAULT_DEMO_EMAIL must be a valid email address')
        return value

    @property
    def origins(self) -> list[str]:
        return [x.strip() for x in self.allowed_origins.split(',') if x.strip()]

    @property
    def hosts(self) -> list[str]:
        # Render fournit un Host sans schéma. Accepter aussi par tolérance
        # une valeur saisie comme URL, sans jamais laisser une variable vide
        # désactiver involontairement tous les hôtes autorisés.
        raw = [x.strip() for x in self.allowed_hosts.split(',') if x.strip()]
        hosts: list[str] = []
        for value in raw:
            candidate = value if '://' in value else f'http://{value}'
            parsed = urlparse(candidate)
            host = parsed.netloc.split('@')[-1].split(':')[0].lower().rstrip('.')
            if host:
                hosts.append(host)
        return hosts or ['*.onrender.com', 'localhost', '127.0.0.1']

    @property
    def superadmin_email_set(self) -> set[str]:
        return {email.strip().casefold() for email in self.superadmin_emails.split(',') if email.strip()}

    def is_superadmin_email(self, email: str | None) -> bool:
        return bool(email and email.strip().casefold() in self.superadmin_email_set)

    @property
    def trial_email_set(self) -> set[str]:
        return {email.strip().casefold() for email in self.trial_emails.split(',') if email.strip()}

    def is_trial_email(self, email: str | None) -> bool:
        return bool(email and email.strip().casefold() in self.trial_email_set)

    @property
    def oidc(self) -> dict[str, str] | None:
        if self.oidc_issuer and self.oidc_client_id and self.oidc_client_secret and self.oidc_redirect_uri:
            issuer = self.oidc_issuer.strip().strip('"\'')
            if not issuer.startswith(('http://', 'https://')):
                issuer = f'https://{issuer}'
            return {'issuer': issuer.rstrip('/'), 'client_id': self.oidc_client_id, 'client_secret': self.oidc_client_secret, 'redirect_uri': self.oidc_redirect_uri}
        if self.entra_tenant_id and self.entra_client_id and self.entra_client_secret and self.entra_redirect_uri:
            return {'issuer': f'https://login.microsoftonline.com/{self.entra_tenant_id}/v2.0', 'client_id': self.entra_client_id, 'client_secret': self.entra_client_secret, 'redirect_uri': self.entra_redirect_uri}
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()
