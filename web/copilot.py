import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .config import get_settings
from .oidc import require_session

router = APIRouter(prefix='/api/copilot', tags=['copilot'])


class Prompt(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


@router.post('/chat')
async def chat(prompt: Prompt, _: str = Depends(require_session)):
    settings = get_settings()
    if not settings.openai_api_key:
        return {'provider': 'rules-only', 'content': 'Fournisseur externe non configuré. La demande doit être validée par un ingénieur humain.'}
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(f'{settings.openai_api_base.rstrip("/")}/chat/completions', headers={'Authorization': f'Bearer {settings.openai_api_key}'}, json={'model': settings.openai_model, 'messages': [{'role': 'system', 'content': 'Tu es un assistant d’ingénierie. Tu ne commandes aucun matériel. Sépare faits, hypothèses et recommandations. Exige une validation humaine.'}, {'role': 'user', 'content': prompt.question}], 'temperature': 0.1, 'max_tokens': 1200})
        response.raise_for_status()
        data = response.json()
    return {'provider': 'openai-compatible', 'model': data.get('model', settings.openai_model), 'content': data['choices'][0]['message']['content']}
