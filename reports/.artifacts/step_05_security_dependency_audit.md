# Step 05 - Dependency Vulnerability Audit

## Project Type
Python (pip) primary
Node.js (npm) in web2/

## Package Manager
- Python: pip / requirements.txt
- Node.js: npm (web2/package-lock.json exists)

## Python Dependencies (requirements.txt)
Flask==2.3.3
Flask-CORS==4.0.0
SQLAlchemy==2.0.35
python-dotenv==1.0.0
Werkzeug==2.3.7
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
python-jose[cryptography]>=3.3.0
pydantic>=2.0.0
gunicorn==21.2.0
psycopg[binary]>=3.1.0
mailersend>=0.6.0
reportlab==4.0.0

## Vulnerability Audit Result
pip-audit: NOT INSTALLED (tool not available in environment)
safety: NOT INSTALLED
Note: CVE counts cannot be confirmed without audit tool.
Recommendation: Install pip-audit (pip install pip-audit) and run regularly.

Known version concerns:
- Flask==2.3.3: Flask 3.x is current (2.x receives security patches, but not latest)
- Werkzeug==2.3.7: Werkzeug 3.x is current
- python-jose[cryptography]>=3.3.0: python-jose has known CVEs; consider migrating to PyJWT
- reportlab==4.0.0: check for latest security patches

## Lock File Status
- Python: requirements.txt present, but NOT a proper locked file
  - Mixed version pinning: some packages use `==`, others use `>=`
  - No SHA256 hashes (pip install --require-hashes not enforced)
- Node.js (web2): package-lock.json EXISTS

## Outdated Dependencies Estimate
- Flask 2.3.3 vs 3.x: outdated
- Werkzeug 2.3.7 vs 3.x: outdated
- reportlab 4.0.0: check latest
- Estimate: 5+ packages outdated (exact count requires pip-audit)

## Automated Security Tooling
- Dependabot: NOT CONFIGURED (.github/ folder missing)
- Snyk: NOT CONFIGURED
- Renovate: NOT CONFIGURED
- Pre-commit hooks: NOT CONFIGURED
- CI/CD pipeline: NOT CONFIGURED (.github/workflows/ missing)

## Supply Chain Notes
- python-jose: This library is no longer actively maintained.
  Known CVE: CVE-2024-33664 (algorithm confusion vulnerability).
  Migrate to PyJWT (pip install PyJWT) for better security.

DEPENDENCY_SCORE=70 (Fair)
CVE_CRITICAL=0 (unconfirmed — pip-audit not run)
CVE_HIGH=0 (unconfirmed)
CVE_MEDIUM=1 (python-jose known CVE)
OUTDATED_COUNT=5+
LOCK_FILE=partial (requirements.txt without hashes)
