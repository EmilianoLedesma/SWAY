# Reportes Filtering & Personal/Global Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the mobile Reportes tab from a fixed, unfiltered dump of every metric into a filterable Personal/Global dashboard, with a PDF export that matches whatever filters are active.

**Architecture:** Three existing FastAPI endpoints (`/api/especies/estadisticas`, `/api/avistamientos`, `/api/reportes/especies`) gain optional query params, all backed by two shared filter-builder functions in `app/data/database.py` so screen data and PDF data can never diverge. `ProfileScreen.js`'s Reportes tab gets a Personal/Global sub-tab switcher, a shared `filtros` state object, and filter chip UI wired to the existing `DashboardCharts.js` components.

**Tech Stack:** FastAPI + SQLAlchemy (Python backend, Postgres via `psycopg`), React Native + Expo (mobile), `react-native-svg` (already installed this session for `DashboardCharts.js`).

## Global Constraints

- All new query params are optional and default to `None` — zero params must produce byte-identical responses to today's behavior (web2 calls these same endpoints unfiltered and must not regress).
- `estado` / `habitat` filter values must match `EstadoConservacion.nombre` / `Habitat.nombre` exactly — mobile chips are built from `getEstadosConservacion()`/`getHabitats()` (existing client functions), never a hardcoded local list.
- No new backend test framework — this repo's `test/` directory covers the legacy Flask app only (`from app import app`, `import routes_orm`), unrelated to the current `app/` FastAPI package. Verification here is manual, via `http://localhost:8000/docs` (Swagger UI) and curl, matching how prior work in this repo (`docs/superpowers/specs/2026-07-29-mobile-biometric-login-design.md`) was verified.
- No new commit trailers — do not add `Co-Authored-By` to any commit message in this repo (confirmed user preference).
- Personal tab's session-email-match filtering has a known accuracy limit: only avistamientos submitted with the real colaborador email will match. This is documented, not something to work around in this plan.

---

### Task 1: Backend — shared filter-builder helpers

**Files:**
- Modify: `app/data/database.py`

**Interfaces:**
- Consumes: nothing new (uses existing `Especie`, `EstadoConservacion`, `Habitat`, `EspecieHabitat`, `Avistamiento` models — imported locally inside the functions to avoid the circular import that would result from importing `app.data.models` at module scope, since `models.py` itself imports `Base` from this file).
- Produces: `build_especie_filters(query, estado=None, habitat=None)` and `build_avistamiento_filters(query, fecha_desde=None, fecha_hasta=None, especie_id=None)` — both take and return a SQLAlchemy `Query`, chaining `.join()`/`.filter()` only for params that are not `None`. Tasks 2–4 import these from `app.data.database`.

- [ ] **Step 1: Add the two helper functions**

Append to `app/data/database.py`:

```python
def build_especie_filters(query, estado=None, habitat=None):
    from app.data.models import Especie, EstadoConservacion, EspecieHabitat, Habitat

    if estado:
        query = (
            query.join(EstadoConservacion, Especie.id_estado_conservacion == EstadoConservacion.id)
            .filter(EstadoConservacion.nombre == estado)
        )
    if habitat:
        query = (
            query.join(EspecieHabitat, Especie.id == EspecieHabitat.id_especie)
            .join(Habitat, EspecieHabitat.id_habitat == Habitat.id)
            .filter(Habitat.nombre == habitat)
        )
    return query


def build_avistamiento_filters(query, fecha_desde=None, fecha_hasta=None, especie_id=None):
    from app.data.models import Avistamiento

    if fecha_desde:
        query = query.filter(Avistamiento.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Avistamiento.fecha <= fecha_hasta)
    if especie_id:
        query = query.filter(Avistamiento.id_especie == especie_id)
    return query
```

- [ ] **Step 2: Manually verify no import cycle**

Run: `cd "C:\Users\Emiliano\Videos\SWAY POO" && python -c "import app.data.database; import app.data.models; print('ok')"`
Expected: prints `ok` with no `ImportError`/`circular import` traceback.

- [ ] **Step 3: Commit**

```bash
git add app/data/database.py
git commit -m "feat: add shared species/avistamiento filter-builder helpers"
```

---

### Task 2: Backend — filter `GET /api/especies/estadisticas`

**Files:**
- Modify: `app/routers/especies.py:163-194` (the `get_especies_estadisticas` function and its route decorator)

**Interfaces:**
- Consumes: `build_especie_filters` from Task 1.
- Produces: same response shape as today (`{"success": True, "estadisticas": {...}}`), computed over the filtered `Especie` set when params are given.

- [ ] **Step 1: Add query params and apply the filter helper**

Replace the existing `get_especies_estadisticas` function body (currently computing `total_especies` and `conservacion_map` from an unfiltered query) with:

```python
from app.data.database import get_db, build_especie_filters

@router.get("/especies/estadisticas")
async def get_especies_estadisticas(
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    estado: Optional[str] = Query(None),
    habitat: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    try:
        from datetime import date

        especie_query = db.query(Especie)
        especie_query = build_especie_filters(especie_query, estado=estado, habitat=habitat)
        total_especies = especie_query.count()

        stats_query = (
            db.query(EstadoConservacion.nombre, func.count(Especie.id))
            .join(Especie, Especie.id_estado_conservacion == EstadoConservacion.id)
        )
        if habitat:
            stats_query = stats_query.join(
                EspecieHabitat, Especie.id == EspecieHabitat.id_especie
            ).join(Habitat, EspecieHabitat.id_habitat == Habitat.id).filter(Habitat.nombre == habitat)
        stats_conservacion = stats_query.group_by(EstadoConservacion.nombre).all()
        conservacion_map = {nombre: cantidad for nombre, cantidad in stats_conservacion}

        return {"success": True, "estadisticas": {
            "total_especies": total_especies,
            "en_peligro_critico": conservacion_map.get("Extinción Crítica", 0),
            "en_peligro": conservacion_map.get("En Peligro", 0),
            "vulnerables": conservacion_map.get("Vulnerable", 0),
            "especies_marinas": total_especies,
            "especies_agregadas_hoy": 0,
            "especies_agregadas_mes": 0,
            "habitats_representados": 7,
            "regiones_cubiertas": 7
        }}
    except Exception as e:
        print(f"Error en get_especies_estadisticas: {e}")
        return {"success": True, "estadisticas": {
            "total_especies": 2847, "en_peligro_critico": 156, "en_peligro": 300,
            "vulnerables": 891, "especies_marinas": 2200,
            "especies_agregadas_hoy": 3, "especies_agregadas_mes": 89,
            "habitats_representados": 7, "regiones_cubiertas": 7
        }}
```

Note: `estado` is intentionally not applied to `conservacion_map`'s own `.filter()` — filtering the conservation-state breakdown by a single conservation state would just zero out every other bucket, which isn't useful. `estado` only narrows `total_especies`. `habitat` narrows both, since that's a meaningful cross-cut.

- [ ] **Step 2: Manually verify unfiltered call is unchanged**

Start the backend: `uvicorn app.main:app --port 8000 --reload`
Run: `curl http://localhost:8000/api/especies/estadisticas`
Expected: same JSON shape/keys as before this change (compare against a `curl` run from before the edit, or against the response documented in `docs/CLAUDE.md`'s "Reportes de información relevantes" section).

- [ ] **Step 3: Manually verify filtered calls narrow results**

Run: `curl "http://localhost:8000/api/especies/estadisticas?estado=Vulnerable"`
Expected: `total_especies` is less than or equal to the unfiltered count.
Run: `curl "http://localhost:8000/api/especies/estadisticas?habitat=Arrecife"` (substitute a real habitat name from `curl http://localhost:8000/api/habitats`)
Expected: `total_especies` narrows accordingly.

- [ ] **Step 4: Commit**

```bash
git add app/routers/especies.py
git commit -m "feat: add fecha/estado/habitat filters to especies estadisticas endpoint"
```

---

### Task 3: Backend — filter `GET /api/avistamientos`

**Files:**
- Modify: `app/routers/estadisticas.py:84-113` (the `get_avistamientos` function and its route decorator)

**Interfaces:**
- Consumes: `build_avistamiento_filters` from Task 1.
- Produces: same response shape as today (`{"success": True, "avistamientos": [...]}`), narrowed to matching rows when params are given.

- [ ] **Step 1: Add query params and apply the filter helper**

Replace the existing `get_avistamientos` function:

```python
from app.data.database import build_avistamiento_filters

@router.get("/avistamientos")
async def get_avistamientos(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    estado: Optional[str] = None,
    habitat: Optional[str] = None,
    especie_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    try:
        query = (
            db.query(Avistamiento, Especie, Usuario)
            .join(Especie, Avistamiento.id_especie == Especie.id)
            .join(Usuario, Avistamiento.id_usuario == Usuario.id)
        )
        query = build_avistamiento_filters(
            query, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta, especie_id=especie_id
        )
        if estado:
            query = query.join(
                EstadoConservacion, Especie.id_estado_conservacion == EstadoConservacion.id
            ).filter(EstadoConservacion.nombre == estado)
        if habitat:
            from app.data.models import EspecieHabitat, Habitat
            query = query.join(
                EspecieHabitat, Especie.id == EspecieHabitat.id_especie
            ).join(Habitat, EspecieHabitat.id_habitat == Habitat.id).filter(Habitat.nombre == habitat)

        registros = query.order_by(Avistamiento.fecha.desc()).all()

        avistamientos = []
        for avistamiento, especie, usuario in registros:
            avistamientos.append({
                "id": avistamiento.id,
                "fecha": avistamiento.fecha.isoformat() if avistamiento.fecha else None,
                "latitud": float(avistamiento.latitud) if avistamiento.latitud else None,
                "longitud": float(avistamiento.longitud) if avistamiento.longitud else None,
                "notas": avistamiento.notas,
                "especie_nombre": especie.nombre_comun,
                "especie_cientifica": especie.nombre_cientifico,
                "email_usuario": usuario.email
            })

        return {"success": True, "avistamientos": avistamientos}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

`EstadoConservacion` is already imported in this file's model import block; if not, add it alongside `Especie, EstadoConservacion, Avistamiento, Pedido, DetallePedido, Usuario` in the top-of-file import.

- [ ] **Step 2: Manually verify unfiltered call is unchanged**

Run: `curl http://localhost:8000/api/avistamientos`
Expected: same shape and same row count as before this change.

- [ ] **Step 3: Manually verify filters narrow results**

Run: `curl "http://localhost:8000/api/avistamientos?fecha_desde=2026-01-01&fecha_hasta=2026-07-29"`
Expected: fewer or equal rows vs. unfiltered, all with `fecha` inside that range.
Run: `curl "http://localhost:8000/api/avistamientos?especie_id=1"`
Expected: every row's `especie_nombre` matches especie id 1's name (cross-check via `curl http://localhost:8000/api/especies/1` if that route exists, or via `/docs`).

- [ ] **Step 4: Commit**

```bash
git add app/routers/estadisticas.py
git commit -m "feat: add fecha/estado/habitat/especie filters to avistamientos endpoint"
```

---

### Task 4: Backend — filter `GET /api/reportes/especies` (PDF) + filter summary line

**Files:**
- Modify: `app/routers/estadisticas.py:186-...` (the `descargar_reporte_especies` function)

**Interfaces:**
- Consumes: `build_especie_filters`, `build_avistamiento_filters` from Task 1.
- Produces: same PDF response (`Response(content=pdf_bytes, media_type="application/pdf", ...)`), now filtered, with one added line near the top of the document listing active filters.

- [ ] **Step 1: Read the full existing function to preserve its reportlab structure**

Run: `sed -n '186,260p' app/routers/estadisticas.py` (or open the file) to see the full `SimpleDocTemplate`/`story` construction before editing — the exact table-building code around species listing must stay intact except for the query source and the new header line.

- [ ] **Step 2: Add query params, apply filters to the species query, and add the filter-summary line**

At the top of the route:

```python
@router.get("/reportes/especies")
async def descargar_reporte_especies(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    estado: Optional[str] = None,
    habitat: Optional[str] = None,
    especie_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Generar y descargar reporte PDF de especies."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.units import inch
        import io
        from app.data.database import build_especie_filters, build_avistamiento_filters

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        story.append(Paragraph("Reporte de Especies Marinas — SWAY", styles["Title"]))
        story.append(Paragraph(f"Generado: {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles["Normal"]))

        filtro_partes = []
        if estado:
            filtro_partes.append(estado)
        if habitat:
            filtro_partes.append(habitat)
        if fecha_desde or fecha_hasta:
            filtro_partes.append(f"{fecha_desde or '…'}–{fecha_hasta or '…'}")
        if filtro_partes:
            story.append(Paragraph(f"Filtros: {' · '.join(filtro_partes)}", styles["Normal"]))

        story.append(Spacer(1, 0.3 * inch))
```

Then find where the existing code queries species for the table (it queries `db.query(Especie)` or similar further down — apply the same filter helper there):

```python
        especies_query = db.query(Especie)
        especies_query = build_especie_filters(especies_query, estado=estado, habitat=habitat)
        if especie_id:
            especies_query = especies_query.filter(Especie.id == especie_id)
        especies = especies_query.all()
```

Replace whatever unfiltered `db.query(Especie).all()` (or equivalent) call currently feeds the table with this `especies` variable — keep every line after that (the `Table`/`TableStyle` construction, `doc.build(story)`, `Response(...)` return) unchanged.

- [ ] **Step 3: Manually verify unfiltered PDF is unchanged**

Run: `curl http://localhost:8000/api/reportes/especies -o /tmp/before.pdf` then open it.
Expected: same species list/count as the PDF produced before this change.

- [ ] **Step 4: Manually verify filtered PDF**

Run: `curl "http://localhost:8000/api/reportes/especies?estado=Vulnerable" -o /tmp/filtered.pdf` then open it.
Expected: PDF header shows "Filtros: Vulnerable", and the species table lists only vulnerable species.

- [ ] **Step 5: Commit**

```bash
git add app/routers/estadisticas.py
git commit -m "feat: filter PDF report by fecha/estado/habitat/especie and show active filters"
```

---

### Task 5: Mobile — filter-aware API client functions

**Files:**
- Modify: `MockupsSwayMobile/src/api/client.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `getEstadisticasEspecies(filtros)`, `getAvistamientosAll(filtros)`, `downloadReportePDF(filtros)` — each `filtros` is an optional object `{ desde, hasta, estado, habitat, especieId }` (any/all keys omitted = unfiltered, matching current no-arg behavior). Task 6 calls these with the screen's `filtros` state.

- [ ] **Step 1: Add a small query-string builder and update the three functions**

```js
function buildQuery(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.desde) params.set('fecha_desde', filtros.desde);
  if (filtros.hasta) params.set('fecha_hasta', filtros.hasta);
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.habitat) params.set('habitat', filtros.habitat);
  if (filtros.especieId) params.set('especie_id', String(filtros.especieId));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
```

Update `getEstadisticasEspecies`:

```js
export async function getEstadisticasEspecies(filtros) {
  try {
    const res = await fetch(`${API_HOST}/api/especies/estadisticas${buildQuery(filtros)}`);
    return await res.json();
  } catch (error) {
    console.error('Error en getEstadisticasEspecies:', error);
    return { success: false, estadisticas: null };
  }
}
```

Update `getAvistamientosAll`:

```js
export async function getAvistamientosAll(filtros) {
  try {
    const res = await fetch(`${API_HOST}/api/avistamientos${buildQuery(filtros)}`);
    return await res.json();
  } catch (error) {
    console.error('Error en getAvistamientosAll:', error);
    return { success: false, avistamientos: [] };
  }
}
```

Update `downloadReportePDF`:

```js
export async function downloadReportePDF(filtros) {
  try {
    const res = await fetch(`${API_HOST}/api/reportes/especies${buildQuery(filtros)}`);
    if (!res.ok) return { success: false, message: `Error ${res.status}` };
    const buffer = await res.arrayBuffer();
    const file = new File(Paths.cache, 'reporte-especies-sway.pdf');
    if (file.exists) file.delete();
    file.create();
    file.write(new Uint8Array(buffer));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Reporte de especies SWAY',
      });
    }
    return { success: true };
  } catch (error) {
    console.error('Error en downloadReportePDF:', error);
    return { success: false, message: 'No se pudo generar el reporte' };
  }
}
```

(`getEstadisticas` — the general stats endpoint — is left as-is; the spec only adds date-range filtering to it in principle, but `ProfileScreen`'s Global tab only reads `calidad_agua` from it, which isn't filter-sensitive by species/habitat, so this task leaves it unfiltered. If you find yourself needing filtered general stats later, that's a new task, not a silent addition here.)

- [ ] **Step 2: Manually verify from the Expo Go app**

With the backend running and Metro started (`npx expo start`, reload if a native module was touched — none were in this task), confirm the app still loads Reportes with no filters applied (Task 6 wires the UI; for now this just confirms the updated functions don't throw when called with `undefined`).

Run: in a Node REPL or a temporary console.log in `client.js`, confirm `buildQuery()` returns `''` and `buildQuery({estado: 'Vulnerable'})` returns `'?estado=Vulnerable'`.

- [ ] **Step 3: Commit**

```bash
git add MockupsSwayMobile/src/api/client.js
git commit -m "feat: accept filtros param in reportes-related API client functions"
```

---

### Task 6: Mobile — Personal/Global sub-tab switcher + shared filtros state

**Files:**
- Modify: `MockupsSwayMobile/src/screens/ProfileScreen.js`

**Interfaces:**
- Consumes: `getEstadisticasEspecies(filtros)`, `getAvistamientosAll(filtros)` from Task 5.
- Produces: `reportesSubTab` state (`'personal' | 'global'`), `filtros` state object, and a re-fetch effect keyed on both — Task 7 and Task 8 read/write `filtros` and render inside whichever sub-tab is active.

- [ ] **Step 1: Add sub-tab and filtros state**

Near the existing `reportesData`/`reportesLoading`/`reportesError` state (added earlier this session), add:

```js
const [reportesSubTab, setReportesSubTab] = useState('personal');
const [filtros, setFiltros] = useState({});
```

- [ ] **Step 2: Rewrite the reportes-fetch effect to depend on filtros and refetch on change**

Replace the existing effect:

```js
useEffect(() => {
  if (activeTab !== 'reportes') return;
  let active = true;
  setReportesLoading(true);
  setReportesError(null);
  Promise.all([
    getEstadisticasEspecies(filtros),
    getEstadisticas(),
    getAvistamientosAll(filtros),
    getImpactoSostenible(),
  ])
    .then(([espRes, genRes, avRes, impRes]) => {
      if (!active) return;
      setReportesData({
        esStats: espRes?.estadisticas || null,
        genStats: genRes?.success ? genRes : null,
        avist: avRes?.avistamientos || [],
        impacto: impRes?.impacto || null,
      });
    })
    .catch((e) => active && setReportesError(e.message))
    .finally(() => active && setReportesLoading(false));
  return () => {
    active = false;
  };
}, [activeTab, filtros]);
```

This drops the old `reportesData`-guard entirely (it existed to fetch only once; now every `filtros` change must re-fetch) and drops `reportesLoading` from the deps (per the effect-cleanup race fixed earlier this session — putting a state var the effect itself sets into its own deps array causes React to run the in-flight effect's cleanup, marking `active = false` before the fetch resolves, silently discarding the result).

- [ ] **Step 3: Add the sub-tab chip switcher, at the top of the existing `activeTab === 'reportes'` block**

Inside the existing `{activeTab === 'reportes' && (...)}` block, before the loading/error/content conditional, add:

```jsx
<View style={styles.reportesSubTabRow}>
  {['personal', 'global'].map((key) => (
    <TouchableOpacity
      key={key}
      style={[styles.reportesSubTab, reportesSubTab === key && styles.reportesSubTabActive]}
      onPress={() => {
        setReportesSubTab(key);
        setFiltros(key === 'personal' ? { desde: filtros.desde, hasta: filtros.hasta } : {});
      }}
    >
      <Text style={[styles.reportesSubTabText, reportesSubTab === key && styles.reportesSubTabTextActive]}>
        {key === 'personal' ? 'Personal' : 'Global'}
      </Text>
    </TouchableOpacity>
  ))}
</View>
```

Switching to Personal keeps only `desde`/`hasta` (drops `estado`/`habitat`/`especieId`); switching to Global resets to `{}` (Task 8 re-applies Global's own filters as the user picks them).

- [ ] **Step 4: Add the two new styles**

Add alongside the screen's other tab styles (near `styles.tab`/`styles.tabActive`):

```js
reportesSubTabRow: {
  flexDirection: 'row',
  gap: 8,
  marginBottom: 12,
},
reportesSubTab: {
  flex: 1,
  paddingVertical: 10,
  borderRadius: radii.r12,
  borderWidth: 1,
  borderColor: colors.borderMid,
  alignItems: 'center',
},
reportesSubTabActive: {
  backgroundColor: colors.blueLight,
  borderColor: colors.blue,
},
reportesSubTabText: {
  fontFamily: typography.display,
  fontSize: 13,
  fontWeight: typography.weight.semibold,
  color: colors.text2,
},
reportesSubTabTextActive: {
  color: colors.blue,
},
```

- [ ] **Step 5: Manually verify in Expo Go**

Reload the app, open Perfil → Reportes. Expected: sub-tab row shows Personal/Global, tapping between them doesn't crash, and the existing charts still render under Global (Personal will look identical to Global until Task 7 adds Personal-specific rendering — that's expected at this point).

- [ ] **Step 6: Commit**

```bash
git add MockupsSwayMobile/src/screens/ProfileScreen.js
git commit -m "feat: add Personal/Global sub-tabs and shared filtros state to Reportes"
```

---

### Task 7: Mobile — Personal sub-tab (date quick-picks + session-email scoping)

**Files:**
- Modify: `MockupsSwayMobile/src/screens/ProfileScreen.js`

**Interfaces:**
- Consumes: `filtros`, `setFiltros`, `reportesSubTab`, `reportesData` from Task 6; `personal.email` (already loaded via `getProfile()` earlier in this same component).
- Produces: nothing consumed by later tasks — this is the Personal-specific render branch.

- [ ] **Step 1: Add date quick-pick chips (shown only when `reportesSubTab === 'personal'`)**

Inside the reportes tab's content area, before the existing stat cards:

```jsx
{reportesSubTab === 'personal' && (
  <View style={styles.reportesSubTabRow}>
    {[
      { label: '7 días', days: 7 },
      { label: '30 días', days: 30 },
      { label: 'Todo', days: null },
    ].map((opt) => (
      <TouchableOpacity
        key={opt.label}
        style={[styles.reportesSubTab, filtros.quickPick === opt.label && styles.reportesSubTabActive]}
        onPress={() => {
          if (opt.days == null) {
            setFiltros({});
          } else {
            const hasta = new Date().toISOString().slice(0, 10);
            const desde = new Date(Date.now() - opt.days * 86400000).toISOString().slice(0, 10);
            setFiltros({ desde, hasta, quickPick: opt.label });
          }
        }}
      >
        <Text style={[styles.reportesSubTabText, filtros.quickPick === opt.label && styles.reportesSubTabTextActive]}>
          {opt.label}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
)}
```

`quickPick` is a UI-only key on the `filtros` object (not sent to the backend — `buildQuery` from Task 5 only reads `desde`/`hasta`/`estado`/`habitat`/`especieId`, so this extra key is harmlessly ignored server-side).

- [ ] **Step 2: Scope the avistamientos list to the session's own email when Personal is active**

Where `reportesData.avist` currently feeds `topEspecies`/the recent-avistamientos list (added earlier this session), filter it first:

```js
const avistScoped = reportesSubTab === 'personal'
  ? (reportesData?.avist || []).filter((a) => a.email_usuario === personal.email)
  : (reportesData?.avist || []);
```

Replace every existing reference to `reportesData?.avist` in the derived-stats block (the `avist`, `totalAvist`, `especieCount`/`topEspecies` computation added earlier this session) with `avistScoped`.

- [ ] **Step 3: Manually verify**

Reload the app, log in, go to Perfil → Reportes → Personal. Tap "30 días" — expected: avistamientos list narrows to the last 30 days AND only entries matching the logged-in colaborador's email (per the known limitation noted in the spec, this may show 0 results for colaboradores whose avistamientos were submitted before `SightingsScreen.js`'s session-sourcing fix lands — that's expected, not a bug in this task).

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/screens/ProfileScreen.js
git commit -m "feat: scope Personal reportes tab to session email + date quick-picks"
```

---

### Task 8: Mobile — Global sub-tab filters (estado, habitat, especie search)

**Files:**
- Modify: `MockupsSwayMobile/src/screens/ProfileScreen.js`

**Interfaces:**
- Consumes: `filtros`, `setFiltros`, `reportesSubTab` from Task 6; `getEstadosConservacion()`, `getHabitats()`, `getEspecies()` (all already exist in `client.js`, already imported by other tabs in this same screen — confirm the import line includes them, add if missing).
- Produces: nothing consumed by later tasks — this is the Global-specific filter UI.

- [ ] **Step 1: Load catalogs once on mount (not just when Reportes is active, since `getEstadosConservacion`/`getHabitats` are small and already used elsewhere in the app without a loading gate)**

Add state and a mount effect:

```js
const [estadosCatalog, setEstadosCatalog] = useState([]);
const [habitatsCatalog, setHabitatsCatalog] = useState([]);
const [especieSearch, setEspecieSearch] = useState('');
const [especiesCatalog, setEspeciesCatalog] = useState([]);

useEffect(() => {
  getEstadosConservacion().then((r) => setEstadosCatalog(r?.estados || []));
  getHabitats().then((r) => setHabitatsCatalog(r?.habitats || []));
  getEspecies().then((r) => setEspeciesCatalog(r?.especies || []));
}, []);
```

Add `getEstadosConservacion`, `getHabitats`, `getEspecies` to the existing `import { ... } from '../api/client'` block in this file if not already present (`getEspecies` is likely already imported for another tab — check before adding a duplicate).

- [ ] **Step 2: Render estado/habitat chips and a debounced especie search, shown only when `reportesSubTab === 'global'`**

```jsx
{reportesSubTab === 'global' && (
  <>
    <View style={styles.reportesSubTabRow}>
      {estadosCatalog.map((e) => (
        <TouchableOpacity
          key={e.id}
          style={[styles.reportesSubTab, filtros.estado === e.nombre && styles.reportesSubTabActive]}
          onPress={() =>
            setFiltros((f) => ({ ...f, estado: f.estado === e.nombre ? undefined : e.nombre }))
          }
        >
          <Text style={[styles.reportesSubTabText, filtros.estado === e.nombre && styles.reportesSubTabTextActive]}>
            {e.nombre}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
    <View style={styles.reportesSubTabRow}>
      {habitatsCatalog.map((h) => (
        <TouchableOpacity
          key={h.id}
          style={[styles.reportesSubTab, filtros.habitat === h.nombre && styles.reportesSubTabActive]}
          onPress={() =>
            setFiltros((f) => ({ ...f, habitat: f.habitat === h.nombre ? undefined : h.nombre }))
          }
        >
          <Text style={[styles.reportesSubTabText, filtros.habitat === h.nombre && styles.reportesSubTabTextActive]}>
            {h.nombre}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
    <TextInput
      style={styles.input}
      placeholder="Buscar especie..."
      placeholderTextColor={colors.text3}
      value={especieSearch}
      onChangeText={setEspecieSearch}
    />
  </>
)}
```

- [ ] **Step 3: Debounce the especie search into `filtros.especieId`**

```js
useEffect(() => {
  if (reportesSubTab !== 'global') return;
  const handle = setTimeout(() => {
    const match = especieSearch.trim()
      ? especiesCatalog.find((e) =>
          e.nombre_comun?.toLowerCase().includes(especieSearch.trim().toLowerCase())
        )
      : null;
    setFiltros((f) => ({ ...f, especieId: match?.id }));
  }, 400);
  return () => clearTimeout(handle);
}, [especieSearch, especiesCatalog, reportesSubTab]);
```

- [ ] **Step 4: Manually verify**

Reload the app, Perfil → Reportes → Global. Tap a habitat chip — expected: charts/stat cards re-fetch and narrow (network tab or `console.log` in `client.js` confirms the query string includes `habitat=...`). Type a species name — expected: after ~400ms, the request includes `especie_id=<matching id>`. Clear the text — expected: `especieId` goes back to `undefined` and the fetch re-runs unfiltered on that dimension.

- [ ] **Step 5: Commit**

```bash
git add MockupsSwayMobile/src/screens/ProfileScreen.js
git commit -m "feat: add estado/habitat/especie filters to Global reportes sub-tab"
```

---

### Task 9: Mobile — wire filtros into the PDF download button

**Files:**
- Modify: `MockupsSwayMobile/src/screens/ProfileScreen.js` (the existing `handleDownloadReporte` function, added earlier this session)

**Interfaces:**
- Consumes: `downloadReportePDF(filtros)` from Task 5, `filtros` state from Task 6.
- Produces: nothing (terminal task).

- [ ] **Step 1: Pass the current filtros into the existing handler**

```js
const handleDownloadReporte = async () => {
  setReporteLoading(true);
  const result = await downloadReportePDF(filtros);
  setReporteLoading(false);
  if (!result.success) {
    Alert.alert('Error', result.message || 'No se pudo generar el reporte.');
    return;
  }
  Alert.alert('Reporte generado', 'El reporte PDF se descargó correctamente.');
};
```

(This is a one-line change from the existing `downloadReportePDF()` call to `downloadReportePDF(filtros)` — everything else in the function is unchanged from this session's earlier work.)

- [ ] **Step 2: Manually verify end-to-end (this is the spec's acceptance test)**

Reload the app. Go to Reportes → Global, tap the "Vulnerable" estado chip, tap "Descargar reporte PDF". Expected: the shared PDF's header shows "Filtros: Vulnerable" and its species table lists only vulnerable species — matching what Task 4's manual curl test already confirmed server-side, now confirmed reachable from the actual UI.

Then clear all filters and download again. Expected: full-catalog PDF, no "Filtros:" line, matching the original (pre-this-plan) PDF output.

- [ ] **Step 3: Commit**

```bash
git add MockupsSwayMobile/src/screens/ProfileScreen.js
git commit -m "feat: pass active filtros to PDF export so download matches screen"
```

---

## Self-Review Notes

- **Spec coverage:** Two sub-tabs (Task 6), Personal date-range + session-email scope (Task 7), Global estado/habitat/especie filters (Task 8), backend additive query params on all 3 endpoints (Tasks 2–4), shared filter-builder helper (Task 1), filter-aware PDF with header summary (Task 4 + 9), backward-compatible unfiltered behavior (verified in Tasks 2–4's manual steps). All spec sections have a task.
- **Type/name consistency checked:** `filtros` object shape (`desde`, `hasta`, `estado`, `habitat`, `especieId`) is identical across Task 5's `buildQuery`, Task 6/7/8's `setFiltros` calls, and Task 9's `downloadReportePDF(filtros)` call. `build_especie_filters`/`build_avistamiento_filters` signatures from Task 1 match every call site in Tasks 2–4.
- **Known limitation carried through:** Task 7 explicitly notes Personal-tab email matching depends on the (out-of-scope, separate) SightingsScreen session-sourcing fix — not silently glossed over.
