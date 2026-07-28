# Step 03 - Source Code Secret Scanning

## Detected Project Type
Python (FastAPI + Flask)
Scan targets: *.py files

## HIGH Severity Findings (hardcoded secrets)

HIGH-1: Hardcoded JWT SECRET_KEY in production auth module
- File: app/security/auth.py
- Line: 7
- Pattern: SECRET_KEY = "sway_secret_key_ultra_secreta"
- Risk: Any JWT token can be forged by anyone with access to the source code.
  The same literal appears as fallback in docker-compose.prod.yml.

HIGH-2: SMTP credentials in git-tracked plain text file
- File: mailtrap_credentials.txt (TRACKED IN GIT)
- Pattern: Password: 9d327948d5b39bc4335658a7287977bb
- Risk: Active production Mailtrap SMTP credential exposed in git history.
  Password visible to anyone with repository access (present or future).

HIGH-3: Hardcoded database password in docker-compose.yml
- File: docker-compose.yml (TRACKED IN GIT)
- Line: POSTGRES_PASSWORD: sway123
- Pattern: POSTGRES_PASSWORD: sway123 / DATABASE_URL: postgresql+psycopg://sway_app:sway123@postgres:5432/sway
- Risk: Database password hardcoded in tracked configuration file.

HIGH-4: Weak default SECRET_KEY fallback in Flask app
- File: web.py, line 8
- Pattern: app.secret_key = os.environ.get('SECRET_KEY', 'sway_secret_key_ultra_secreta')
- Same weak literal in app.py (legacy, line 8)
- Risk: If SECRET_KEY env var is not set, the app uses a known weak default.
  This default appears in git history, making session tokens forgeable.

## MEDIUM Severity Findings (hardcoded credentials in legacy)

MEDIUM-1: Hardcoded user password in legacy test/check script
- File: legacy/check_users.py, line 10
- Pattern: password = 'Emiliano1'
- Note: Legacy script, not production code, but tracked in git

MEDIUM-2: Hardcoded generic password in legacy script
- File: legacy/check_users.py, line 45
- Pattern: password = "123456"

MEDIUM-3: Hardcoded password in legacy data seeder
- File: legacy/insert_initial_data.py, line 9
- Pattern: password = 'Emiliano1'

MEDIUM-4: .env.example contains real database password
- File: .env.example (tracked in git)
- Pattern: DB_PASSWORD=sway123
- Risk: Real password in template file; anyone cloning the repo gets the DB password.

## LOW Severity Findings

LOW-1: DEBUG=True in .env (not tracked, but present locally)
- Risk: If .env is deployed as-is to production, debug mode is active.

LOW-2: JWT token expiry set to 8 hours
- File: app/security/auth.py, line 9
- Pattern: ACCESS_TOKEN_EXPIRE_HOURS = 8
- Risk: Long token lifetime increases window for token compromise.

## Summary
- HIGH: 4 findings
- MEDIUM: 4 findings
- LOW: 2 findings

## Secrets in Git History
- mailtrap_credentials.txt committed at: commit 5faf688 (2026-03-28)
  "feat: actualizar configuración de envío de correos y agregar nuevos comandos de servidor"
- Removing the file from the repository does NOT remove it from git history.
  Git history must be purged (BFG Repo Cleaner or git filter-repo).

## Tooling
- Pre-commit hooks: NOT CONFIGURED
- .gitleaks.toml: NOT FOUND
- Gitleaks: NOT INSTALLED

SECRET_SCORE=0 (Critical — clamped from -5)
GIT_HISTORY_FINDINGS=1
