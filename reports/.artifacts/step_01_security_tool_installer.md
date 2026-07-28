# Step 01 - Tool Detection Results

PROJECT_DETECTION_RESULTS=python@.|nodejs@./web2

Detected project types:
- python@. (primary) — pyproject.toml / requirements.txt found at root
- nodejs@./web2 — package.json found in web2/ (React + Vite frontend)

Source file extensions to scan:
- Python: *.py
- JavaScript/TypeScript: *.js, *.jsx, *.ts, *.tsx

Package managers detected:
- Python: pip (requirements.txt)
- Node.js: npm (package.json + package-lock.json in web2/)

Gemini CLI: NOT INSTALLED
Gemini AI analysis will be SKIPPED
To install: npm install -g @google/gemini-cli

GEMINI_AVAILABLE=false

Frameworks detected:
- FastAPI (app/main.py, fastapi in requirements.txt)
- Flask (web.py, Flask in requirements.txt)
- React + Vite (web2/)
- Docker / Docker Compose (docker-compose.yml, docker-compose.prod.yml)
- PostgreSQL (db.py, docker-compose.yml)
- Nginx (nginx.prod.conf)
- AI/ML: face_recognition + OpenCV (face_service.py)
