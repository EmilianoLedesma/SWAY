import os
import sqlite3
from datetime import datetime, timezone

def _default_db_path() -> str:
    # Read fresh, not captured once at import time, so whichever test module
    # imports this file first doesn't freeze the path for every caller.
    return os.environ.get("PORTFOLIO_DB_PATH", "/data/portfolio.db")

SEED_POSTULATIONS = [
    dict(id="eos", company="EOS Soluciones", role="Desarrollador (Estadía)",
         location="Ciudad Maderas, El Marqués, Qro. · Híbrido",
         salary="Se acuerda en entrevista",
         schedule="L-V 9:00-18:00, sáb. ocasional 9:00-13:00",
         date_applied="2026-08-11", source="Cold email",
         requirements="Desarrollo orientado a objetos\nBases de datos\nComunicación efectiva\nDesarrollo móvil (opcional)",
         notes="", status="postulado"),
    dict(id="cloud-cyber", company="Solución Cloud & Ciberseguridad",
         role="Becario de Tecnologías de la Información",
         location="Querétaro · Presencial", salary="$5,000/mes",
         schedule="Medio tiempo, mín. 20 hrs/semana",
         date_applied="2026-08-11", source="Postulación directa",
         requirements="Windows, Linux, TCP/IP, VPN\nSaaS/PaaS/IaaS\nAzure, M365, Google Workspace\nInglés B1+",
         notes="", status="postulado"),
    dict(id="kostal", company="KOSTAL", role="Quality Trainee",
         location="Santiago de Querétaro",
         salary="$8,400/mes + comedor gratuito",
         schedule="L-V 7:30-16:30, mín. 6 meses",
         date_applied="2026-08-11", source="Postulación directa",
         requirements="Excel intermedio\nResolución de problemas\nSeguro Facultativo vigente\nInglés intermedio",
         notes="", status="postulado"),
    dict(id="bosch", company="Bosch (vía Pro Meritum)",
         role="Practicante de Soporte TI", location="Colón, Qro. · Presencial",
         salary="$8,000/mes", schedule="L-V 8:00-15:00",
         date_applied="2026-08-11", source="Pro Meritum",
         requirements="Inglés intermedio\nExcel/Office intermedio\nSCRUM básico\nHardware intermedio",
         notes="", status="postulado"),
    dict(id="gozen-ai", company="GoZen AI", role="AI / ML Engineer Jr.",
         location="El Refugio, Querétaro · Híbrido", salary="$18,000/mes",
         schedule="Nómina con prestaciones de ley",
         date_applied="2026-08-11", source="Glassdoor",
         requirements="Python (NumPy, Pandas, Scikit-learn)\nAPI de LLM (Claude/GPT/Gemini)\nLangChain/LlamaIndex (deseable)\nBases de datos vectoriales\nGit",
         notes="", status="postulado"),
    dict(id="terminal-logistics", company="Términal Logistics",
         role="Desarrollador Jr", location="Querétaro", salary="$27,000/mes",
         schedule="", date_applied="2026-08-11", source="Glassdoor",
         requirements=".Net, PHP, Python o Node.js\nHTML, CSS, JavaScript\nReact, Angular o similar",
         notes="", status="postulado"),
    dict(id="data-analytics-jr", company="Taydeé García Medina",
         role="Data Analytics Jr", location="Querétaro",
         salary="$11,000-$16,000/mes",
         schedule="Medio tiempo o tiempo completo",
         date_applied="2026-08-11", source="Glassdoor",
         requirements="Excel avanzado\nAnálisis de datos\nApoyo a áreas de impuestos",
         notes="", status="postulado"),
    dict(id="team-integrity", company="Team Integrity",
         role="Practicante de IA Generativa, Automatización y Procesos",
         location="Querétaro", salary="$9,000/mes", schedule="",
         date_applied="2026-08-11", source="Glassdoor",
         requirements="Interés en IA aplicada a procesos\nObservación y análisis de actividades por área",
         notes="", status="postulado"),
    dict(id="equinix", company="EQUINIX",
         role="Practicante en Operaciones en Centros de Datos",
         location="Parque Tecnológico Innovación · Presencial",
         salary="$11,000 pesos mensuales", schedule="L-V 09:00-15:00",
         date_applied="2026-08-11", source="Bolsa de prácticas",
         requirements="Interés por infraestructura tecnológica y operaciones\nProactivo, organizado y con disposición para aprender\nDisponibilidad L-V 6 hrs/día",
         notes="", status="postulado"),
    dict(id="more-pepper", company="More Pepper",
         role="Estadía en Innovación Digital", location="Híbrido",
         salary="Se menciona en entrevista",
         schedule="L-J 9:00-18:00, V 9:00-17:00",
         date_applied="2026-08-11", source="Bolsa de prácticas",
         requirements="Conocimientos básicos en desarrollo web e IA\nHTML, CSS y JavaScript\nInglés técnico básico",
         notes="", status="postulado"),
    dict(id="thermo-logistica", company="Arrendadora Thermo Logística",
         role="Practicante de Sistemas TI", location="El Colorado · Presencial",
         salary="Se menciona en entrevista", schedule="L-V 08:00-13:00",
         date_applied="2026-08-11", source="Bolsa de prácticas",
         requirements="Office/Google Workspace\nFundamentos de sistemas computacionales\nSeguridad informática y respaldo\nMantenimiento de equipos de cómputo",
         notes="", status="postulado"),
]


def get_conn(db_path: str | None = None) -> sqlite3.Connection:
    db_path = db_path or _default_db_path()
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS postulations (
          id TEXT PRIMARY KEY,
          company TEXT NOT NULL,
          role TEXT NOT NULL,
          location TEXT,
          salary TEXT,
          schedule TEXT,
          date_applied TEXT,
          source TEXT,
          requirements TEXT,
          notes TEXT,
          status TEXT NOT NULL DEFAULT 'postulado',
          created_at TEXT,
          updated_at TEXT
        );
        """
    )
    conn.commit()


def seed_postulations(conn: sqlite3.Connection) -> int:
    existing = conn.execute("SELECT COUNT(*) AS n FROM postulations").fetchone()["n"]
    if existing > 0:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    for p in SEED_POSTULATIONS:
        conn.execute(
            """INSERT INTO postulations
               (id, company, role, location, salary, schedule, date_applied,
                source, requirements, notes, status, created_at, updated_at)
               VALUES (:id, :company, :role, :location, :salary, :schedule,
                       :date_applied, :source, :requirements, :notes, :status,
                       :created_at, :updated_at)""",
            {**p, "created_at": now, "updated_at": now},
        )
    conn.commit()
    return len(SEED_POSTULATIONS)
