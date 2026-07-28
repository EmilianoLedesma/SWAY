# Step 08 - SAST Analysis (OWASP Patterns)

## Scan Scope
Language: Python
Directories scanned: app/, LEGACY_FLASK/, legacy/, web2/src/

## SQL Injection Findings

MEDIUM: Potential SQL injection via string interpolation
- File: LEGACY_FLASK/blueprints/api/especies.py
- Line: 334
- Pattern: f"SELECT id, descripcion FROM Especies WHERE id IN ({','.join(['?' for _ in species_ids])})"
- Note: Uses parameterized placeholders (`?`), which is SAFE for the IN clause itself.
  However, the construction pattern should be reviewed for edge cases.
  Classify as LOW (parameterized query, but uses legacy pattern).

No raw string concatenation SQL found in main app/ (FastAPI, SQLAlchemy ORM) — SAFE.

## XSS Findings

No XSS patterns found in Python backend.
Frontend (web2/React): Not scanned (Vite/React JSX compiled output only).
Flask templates (Jinja2): Jinja2 auto-escaping is ON by default for HTML templates — SAFE.

## Path Traversal Findings

No direct path traversal patterns found (no open() with request parameters).

## Eval / Code Injection

No eval() or exec() patterns found in production code.

## Additional Findings

LOW: Swagger UI (OpenAPI /docs) exposed in production nginx config
- File: nginx.prod.conf, line 16-20
- Risk: Exposes full API documentation including endpoint structure and schemas.
  Attackers can use /docs and /openapi.json to enumerate all API endpoints.

LOW: CORS configured with wildcard methods
- File: app/main.py, line 23
- Pattern: allow_methods=["*"]
- Risk: Allows all HTTP methods from listed origins. Should restrict to
  GET, POST, PUT, DELETE as needed.

LOW: Cache-Control headers set to no-cache globally (development mode)
- File: web.py, add_no_cache_headers function
- Risk: Appropriate for development but may impact production performance.

## Summary
- SQL Injection: 1 LOW (parameterized, legacy pattern)
- XSS: 0
- Path Traversal: 0
- Eval/Exec: 0
- Configuration findings: 2 LOW

SAST findings do not affect main scoring sections.
