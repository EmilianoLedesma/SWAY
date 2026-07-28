# Step 02 - Sensitive File Analysis

## Detected Project Type
Python (FastAPI + Flask) + Node.js (React/Vite)
Repository structure: Single monorepo with web2/ subdirectory

## .gitignore Files Found
- .gitignore (root)

## .gitignore Coverage
Root .gitignore contains:
- .env, .env.local, .env.production patterns: YES (SAFE)
- __pycache__, *.py[cod]: YES
- venv/, ENV/, env/: YES
- *.log: YES
- uploads/*: YES
- node_modules/: YES
- .claude/: YES
Missing:
- reports/ directory: NOT IGNORED (generated reports may leak to git)
- docker-compose.yml secrets: NOT ADDRESSED at .gitignore level
- mailtrap_credentials.txt: NOT IGNORED (CRITICAL)

## Environment Files
- .env: EXISTS, NOT tracked in git (SAFE), properly in .gitignore
- .env.example: EXISTS, TRACKED in git — contains REAL passwords:
  - DB_PASSWORD=sway123 (real database password, should be placeholder)
- .env.local: NOT found
- .env.production: NOT found

## Sensitive Files Detected
| File | Status | Risk |
|------|--------|------|
| .env | Local only, gitignored | SAFE |
| .env.example | Tracked in git | MEDIUM - contains real DB password |
| mailtrap_credentials.txt | TRACKED IN GIT | CRITICAL - real SMTP password |
| docker-compose.yml | TRACKED IN GIT | HIGH - hardcoded DB credentials |
| docker-compose.prod.yml | TRACKED IN GIT | MEDIUM - has default fallback credentials |

## git ls-files Verification
Tracked sensitive files confirmed:
- .env.example (contains real DB_PASSWORD=sway123)
- mailtrap_credentials.txt (contains SMTP password 9d327948d5b39bc4335658a7287977bb)
- Terminales.txt (server terminal commands — informational)
- PLAN.md, README.md (project docs — OK)

.env NOT tracked: VERIFIED SAFE

## Credential Files
- mailtrap_credentials.txt: TRACKED IN GIT
  - Contains: Mailtrap Production SMTP credentials
  - Password: 9d327948d5b39bc4335658a7287977bb (active production credential)

## Platform-Specific Missing Patterns
- Python: Missing reports/ pattern in .gitignore
- Docker: No .gitignore exclusion for docker-compose.yml inline secrets
- No multi-directory .gitignore (web2/ lacks its own)

## Score Computation
- Credential file tracked (mailtrap_credentials.txt): -25
- Missing platform patterns (Docker credentials in tracked config): -10
- .env.example with real passwords (no safe placeholder bonus): 0
- .env NOT tracked: SAFE (no penalty)
- Single .gitignore: no multi-dir bonus

SENSITIVE_FILE_SCORE=65 (Weak)
