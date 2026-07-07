import os
import json
import uuid
import httpx
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from paax_db.models import Project, MorningReport
from paax_db.schemas import MorningReportCreate
import logging

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

SYSTEM_PROMPT = """Anda adalah asisten AI pembuat Laporan Pagi Proyek.
Anda HANYA boleh menarasikan angka yang diberikan di context. 
DILARANG menghitung/mengarang angka baru. 
Kutip angka PERSIS seperti di context.
Tugas Anda adalah merangkum metrik menjadi ringkasan yang jelas dan profesional.

Format jawaban harus berstruktur JSON dengan schema berikut:
{
    "summary": "String narasi 2-4 kalimat (progres, warning, dan review)",
    "highlights": ["Poin positif 1", "Poin positif 2"],
    "concerns": ["Poin risiko 1", "Poin risiko 2"]
}
HANYA hasilkan JSON valid tanpa markdown backticks."""

def _mock_schedule_deviation(project_id: str) -> float:
    # Dummy implementation for fetching schedule deviation from core-engine
    return -2.5 # e.g. -2.5% deviation

async def generate_morning_report_data(project_id: str, db: AsyncSession) -> dict:
    # Fetch project data
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise ValueError("Project not found")

    progress = project.progress
    warnings = len(project.warnings) if project.warnings else 0
    
    # In a real app we'd count rab_drafts with status=perlu_review, here we'll mock
    n_perlu_review = 5 
    
    deviation = _mock_schedule_deviation(project_id)
    
    metrics = {
        "progress": progress,
        "warnings_count": warnings,
        "items_perlu_review": n_perlu_review,
        "schedule_deviation": deviation
    }
    return metrics

async def generate_report(project_id: str, db: AsyncSession) -> MorningReportCreate:
    metrics = await generate_morning_report_data(project_id, db)
    
    gemini_key = os.getenv("GEMINI_API_KEY")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    
    # Fallback to rule-based
    if not gemini_key:
        return MorningReportCreate(
            project_id=project_id,
            summary=f"Progres proyek saat ini mencapai {metrics['progress']}%. Terdapat {metrics['warnings_count']} warning terbuka dan {metrics['items_perlu_review']} item menunggu review. Deviasi jadwal adalah {metrics['schedule_deviation']}%.",
            highlights=[f"Progres proyek mencapai {metrics['progress']}%."],
            concerns=[f"Deviasi jadwal: {metrics['schedule_deviation']}%", f"{metrics['warnings_count']} warning terbuka", f"{metrics['items_perlu_review']} item menunggu review"],
            metrics_snapshot=metrics,
            narrative_source="rule-based-fallback"
        )
    
    # Gemini path
    prompt = f"Berikut adalah metrik proyek {project_id} hari ini:\n"
    prompt += json.dumps(metrics, indent=2)
    
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "generationConfig": {"temperature": 0.1}
    }
    
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=body, timeout=10.0)
            resp.raise_for_status()
            
        resp_json = resp.json()
        raw_text = resp_json.get("candidates", [])[0].get("content", {}).get("parts", [])[0].get("text", "{}")
        
        # Clean up markdown JSON block if present
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:-3]
        elif raw_text.startswith("```"):
            raw_text = raw_text[3:-3]
            
        parsed = json.loads(raw_text)
        
        return MorningReportCreate(
            project_id=project_id,
            summary=parsed.get("summary", ""),
            highlights=parsed.get("highlights", []),
            concerns=parsed.get("concerns", []),
            metrics_snapshot=metrics,
            narrative_source=gemini_model
        )
        
    except Exception as e:
        logger.error(f"Gemini API failed: {e}")
        # Fallback to rule-based on failure
        return MorningReportCreate(
            project_id=project_id,
            summary=f"Progres proyek saat ini mencapai {metrics['progress']}%. Terdapat {metrics['warnings_count']} warning terbuka dan {metrics['items_perlu_review']} item menunggu review. Deviasi jadwal adalah {metrics['schedule_deviation']}%.",
            highlights=[f"Progres proyek mencapai {metrics['progress']}%."],
            concerns=[f"Deviasi jadwal: {metrics['schedule_deviation']}%", f"{metrics['warnings_count']} warning terbuka", f"{metrics['items_perlu_review']} item menunggu review"],
            metrics_snapshot=metrics,
            narrative_source="rule-based-fallback"
        )
