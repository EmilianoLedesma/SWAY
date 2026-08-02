# Event Attendance (RSVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a colaborador RSVP to an upcoming event from the app, see their own registered events on a dedicated screen, and have that real signal drive the "Voluntario activo"/"Primer evento" badges — replacing the "events organized" proxy those badges used before real attendance data existed.

**Architecture:** Backend gains 3 endpoints on the existing `RegistroEvento` table (previously unused anywhere in the app) plus a `registrados` count on the existing event listing. Mobile gets 3 new client functions, an RSVP button in the existing event detail modal, and a new stack screen ("Voy a asistir") listing your own registrations. `GamificationContext` switches its attendance-badge data source from organized events to real registrations.

## Global Constraints

- RSVP only — no attendance check-in. Every row this feature creates has `asistio = NULL` (unconfirmed), never `true`. Confirming actual attendance is explicitly out of scope.
- Capacity is enforced: RSVP rejected once real `RegistroEvento` row count for an event reaches `capacidad_maxima`.
- Auth pattern for all 3 new endpoints matches the existing `DELETE /api/eventos/{id}` in the same file: `Optional[dict] = Depends(get_optional_organizador_user)` + manual `if not current_user: raise HTTPException(401)` — not `get_current_colaborador` (a different dependency used in a different router file). Match the local file convention.
- New screen is named "Voy a asistir", registered as a `Stack.Screen` — never "Mis Eventos" (that name collides with the existing "Míos" organizer filter, a different concept entirely).
- No ownership/ceiling checks beyond capacity — any authenticated colaborador can RSVP to any Activo event.

---

### Task 1: Backend — 3 endpoints + `registrados` count

**Files:**
- Modify: `app/routers/eventos.py` (full rewrite of `get_eventos`'s body into two reusable helpers, plus 3 new endpoints)
- Test: `test/test_eventos_registro.py` (new)

**Interfaces:**
- Produces: `POST /api/eventos/{evento_id}/registrar` → `{"success": true, "message": "Asistencia confirmada"}` on success, `400`/`404`/`401` on failure. `DELETE /api/eventos/{evento_id}/registrar` → `{"success": true, "message": "Asistencia cancelada"}`, `404`/`401` on failure. `GET /api/eventos/mis-registros` → same shape as `GET /api/eventos` (`{"success": true, "eventos": [...]}`), filtered to the current user's registrations. `GET /api/eventos` (existing) — each event object gains `"registrados": <int>`.
- Consumes: `RegistroEvento`, `Evento` models (`app/data/models.py`, already exist, no schema changes needed), `get_optional_organizador_user` (`app/security/auth.py`, already imported in this file).

- [ ] **Step 1: Write the failing tests**

Create `test/test_eventos_registro.py`:

```python
from fastapi.testclient import TestClient

from app.main import app
from app.data.models import TipoEvento, Modalidad, Estatus, Usuario, Organizador, Evento
from app.security.auth import get_optional_organizador_user
from conftest import TestSession

client = TestClient(app)


def _seed_evento(capacidad_maxima=2):
    db = TestSession()
    tipo = TipoEvento(nombre="Conferencia")
    modalidad = Modalidad(nombre="Presencial")
    estatus_activo = Estatus(nombre="Activo")
    usuario_organizador = Usuario(nombre="Org", apellido_paterno="Test", email="org.registro@demo-sway.com", activo=True)
    db.add_all([tipo, modalidad, estatus_activo, usuario_organizador])
    db.commit()
    organizador = Organizador(id_usuario=usuario_organizador.id, experiencia_eventos=0, certificado=False)
    db.add(organizador)
    db.commit()
    evento = Evento(
        titulo="Evento de prueba",
        descripcion="Prueba de registro de asistencia",
        fecha_evento="2026-12-01",
        hora_inicio="10:00",
        hora_fin="12:00",
        id_tipo_evento=tipo.id,
        id_modalidad=modalidad.id,
        capacidad_maxima=capacidad_maxima,
        costo=0,
        id_organizador=organizador.id,
        id_estatus=estatus_activo.id,
    )
    db.add(evento)
    db.commit()
    evento_id = evento.id
    db.close()
    return evento_id


def _override_user(user_id):
    app.dependency_overrides[get_optional_organizador_user] = lambda: {"sub": str(user_id), "token_type": "colaborador"}


def test_registrar_requires_auth():
    evento_id = _seed_evento()
    app.dependency_overrides.pop(get_optional_organizador_user, None)
    try:
        resp = client.post(f"/api/eventos/{evento_id}/registrar")
        assert resp.status_code == 401
    finally:
        _override_user(999)


def test_registrar_evento_inexistente_404():
    _override_user(1)
    resp = client.post("/api/eventos/999999/registrar")
    assert resp.status_code == 404


def test_registrar_y_aparece_en_mis_registros():
    evento_id = _seed_evento()
    _override_user(101)
    resp = client.post(f"/api/eventos/{evento_id}/registrar")
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    mis = client.get("/api/eventos/mis-registros")
    assert mis.status_code == 200
    ids = [e["id"] for e in mis.json()["eventos"]]
    assert evento_id in ids


def test_registrar_duplicado_rechazado():
    evento_id = _seed_evento()
    _override_user(102)
    primero = client.post(f"/api/eventos/{evento_id}/registrar")
    assert primero.status_code == 200
    segundo = client.post(f"/api/eventos/{evento_id}/registrar")
    assert segundo.status_code == 400


def test_capacidad_llena_rechaza_registro():
    evento_id = _seed_evento(capacidad_maxima=1)
    _override_user(103)
    primero = client.post(f"/api/eventos/{evento_id}/registrar")
    assert primero.status_code == 200

    _override_user(104)
    segundo = client.post(f"/api/eventos/{evento_id}/registrar")
    assert segundo.status_code == 400


def test_cancelar_asistencia():
    evento_id = _seed_evento()
    _override_user(105)
    client.post(f"/api/eventos/{evento_id}/registrar")

    cancelar = client.delete(f"/api/eventos/{evento_id}/registrar")
    assert cancelar.status_code == 200

    mis = client.get("/api/eventos/mis-registros")
    ids = [e["id"] for e in mis.json()["eventos"]]
    assert evento_id not in ids


def test_cancelar_sin_registro_404():
    evento_id = _seed_evento()
    _override_user(106)
    resp = client.delete(f"/api/eventos/{evento_id}/registrar")
    assert resp.status_code == 404


def test_get_eventos_incluye_conteo_registrados():
    evento_id = _seed_evento()
    _override_user(107)
    client.post(f"/api/eventos/{evento_id}/registrar")

    listado = client.get("/api/eventos")
    evento = next(e for e in listado.json()["eventos"] if e["id"] == evento_id)
    assert evento["registrados"] >= 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest test/test_eventos_registro.py -v`
Expected: FAIL — `404 Not Found` on the new routes (they don't exist yet), and `KeyError: 'registrados'`.

- [ ] **Step 3: Update imports in `app/routers/eventos.py`**

Replace the import block (lines 1-10):

```python
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.data.database import get_db
from app.data.models import (
    Evento, TipoEvento, Modalidad, Organizador, Usuario,
    Estatus, Direccion, Calle, Colonia, Municipio, Estado, RegistroEvento
)
from app.security.auth import get_optional_organizador_user
from app.models.eventos import EventoCreate
```

- [ ] **Step 4: Extract the shared query-building and serialization into two helpers**

Replace the entire `get_eventos` function (currently lines 15-105 — from `@router.get("/eventos")` through the end of its `except Exception` block) with:

```python
def _base_eventos_query(db: Session):
    return (
        db.query(Evento, TipoEvento, Modalidad, Usuario, Estatus, Calle, Colonia, Municipio, Estado)
        .outerjoin(TipoEvento, Evento.id_tipo_evento == TipoEvento.id)
        .outerjoin(Modalidad, Evento.id_modalidad == Modalidad.id)
        .outerjoin(Organizador, Evento.id_organizador == Organizador.id)
        .outerjoin(Usuario, Organizador.id_usuario == Usuario.id)
        .outerjoin(Estatus, Evento.id_estatus == Estatus.id)
        .outerjoin(Direccion, Evento.id_direccion == Direccion.id)
        .outerjoin(Calle, Direccion.id_calle == Calle.id)
        .outerjoin(Colonia, Calle.id_colonia == Colonia.id)
        .outerjoin(Municipio, Colonia.id_municipio == Municipio.id)
        .outerjoin(Estado, Municipio.id_estado == Estado.id)
    )


def _serializar_eventos(db: Session, filas):
    conteos_registro = dict(
        db.query(RegistroEvento.id_evento, func.count(RegistroEvento.id))
        .group_by(RegistroEvento.id_evento)
        .all()
    )

    eventos = []
    for evento, tipo_ev, modal, usr, est, calle, colonia, municipio, estado_geo in filas:
        partes_dir = []
        if calle:
            partes_dir.append(calle.nombre)
            if calle.n_exterior:
                partes_dir.append(str(calle.n_exterior))
        if colonia:
            partes_dir.append(colonia.nombre)
        if municipio:
            partes_dir.append(municipio.nombre)
        if estado_geo:
            partes_dir.append(estado_geo.nombre)
        direccion_completa = ", ".join(p for p in partes_dir if p)

        nombre_organizador = None
        if usr:
            partes_nombre = [usr.nombre, usr.apellido_paterno, usr.apellido_materno]
            nombre_organizador = " ".join(p for p in partes_nombre if p)

        costo = float(evento.costo) if evento.costo else 0.0

        eventos.append({
            "id": evento.id,
            "title": evento.titulo,
            "titulo": evento.titulo,
            "descripcion": evento.descripcion,
            "start": evento.fecha_evento.isoformat() if evento.fecha_evento else None,
            "fecha_evento": evento.fecha_evento.isoformat() if evento.fecha_evento else None,
            "hora_inicio": str(evento.hora_inicio) if evento.hora_inicio else None,
            "hora_fin": str(evento.hora_fin) if evento.hora_fin else None,
            "url_evento": evento.url_evento,
            "capacidad_maxima": evento.capacidad_maxima,
            "costo": costo,
            "tipo_evento": tipo_ev.nombre if tipo_ev else None,
            "modalidad": modal.nombre if modal else None,
            "organizador": nombre_organizador,
            "estatus": est.nombre if est else None,
            "direccion": direccion_completa,
            "es_gratuito": costo == 0.0,
            "registrados": conteos_registro.get(evento.id, 0),
        })
    return eventos


@router.get("/eventos")
async def get_eventos(
    tipo: str = Query(""),
    modalidad: str = Query(""),
    fecha_inicio: str = Query(""),
    fecha_fin: str = Query(""),
    mine: bool = Query(False),
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    try:
        if mine and not current_user:
            raise HTTPException(status_code=401, detail="Se requiere autenticación para filtrar tus eventos")
        q = _base_eventos_query(db).filter(Estatus.nombre == "Activo")

        if tipo:
            q = q.filter(TipoEvento.nombre == tipo)
        if modalidad:
            q = q.filter(Modalidad.nombre == modalidad)
        if fecha_inicio:
            q = q.filter(Evento.fecha_evento >= fecha_inicio)
        if fecha_fin:
            q = q.filter(Evento.fecha_evento <= fecha_fin)
        if mine:
            q = q.filter(Organizador.id_usuario == int(current_user["sub"]))

        q = q.order_by(Evento.fecha_evento.asc(), Evento.hora_inicio.asc())
        filas = q.all()
        eventos = _serializar_eventos(db, filas)

        return {"success": True, "eventos": eventos}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en get_eventos: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

This is a pure refactor of the existing endpoint — same behavior, same response shape plus the new `registrados` field. `_serializar_eventos` is reused by Step 6's new `mis-registros` endpoint below, avoiding a second ~40-line copy of the same mapping logic.

- [ ] **Step 5: Run the pre-existing eventos test to confirm the refactor didn't break anything**

Run: `python -m pytest test/test_eventos_registro.py::test_get_eventos_incluye_conteo_registrados -v`
Expected: still FAILS at this point (the RSVP endpoint it depends on doesn't exist yet) — this step is just confirming `_base_eventos_query`/`_serializar_eventos` import and run without a Python error. If you see a `500` with a stack trace instead of the expected `404`-first failure, stop and fix the refactor before continuing.

- [ ] **Step 6: Add the 3 new endpoints**

Add after `eliminar_evento` (after its closing `except Exception` block, before `@router.get("/tipos-evento")`):

```python
@router.post("/eventos/{evento_id}/registrar")
async def registrar_asistencia(
    evento_id: int,
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Se requiere autenticación")
        user_id = int(current_user["sub"])

        evento = db.query(Evento).filter(Evento.id == evento_id).first()
        if not evento:
            raise HTTPException(status_code=404, detail="Evento no encontrado")

        ya_registrado = (
            db.query(RegistroEvento)
            .filter(RegistroEvento.id_evento == evento_id, RegistroEvento.id_usuario == user_id)
            .first()
        )
        if ya_registrado:
            raise HTTPException(status_code=400, detail="Ya confirmaste tu asistencia a este evento")

        if evento.capacidad_maxima is not None:
            registrados = (
                db.query(func.count(RegistroEvento.id))
                .filter(RegistroEvento.id_evento == evento_id)
                .scalar()
            )
            if registrados >= evento.capacidad_maxima:
                raise HTTPException(status_code=400, detail="Cupo lleno")

        nuevo_registro = RegistroEvento(
            id_evento=evento_id,
            id_usuario=user_id,
            fecha_registro=datetime.utcnow(),
            asistio=None
        )
        db.add(nuevo_registro)
        db.commit()

        return {"success": True, "message": "Asistencia confirmada"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en registrar_asistencia: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/eventos/{evento_id}/registrar")
async def cancelar_asistencia(
    evento_id: int,
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Se requiere autenticación")
        user_id = int(current_user["sub"])

        registro = (
            db.query(RegistroEvento)
            .filter(RegistroEvento.id_evento == evento_id, RegistroEvento.id_usuario == user_id)
            .first()
        )
        if not registro:
            raise HTTPException(status_code=404, detail="No estás registrado en este evento")

        db.delete(registro)
        db.commit()

        return {"success": True, "message": "Asistencia cancelada"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en cancelar_asistencia: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/eventos/mis-registros")
async def get_mis_registros(
    current_user: Optional[dict] = Depends(get_optional_organizador_user),
    db: Session = Depends(get_db)
):
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Se requiere autenticación")
        user_id = int(current_user["sub"])

        q = (
            _base_eventos_query(db)
            .join(RegistroEvento, RegistroEvento.id_evento == Evento.id)
            .filter(RegistroEvento.id_usuario == user_id)
            .order_by(Evento.fecha_evento.asc(), Evento.hora_inicio.asc())
        )
        filas = q.all()
        eventos = _serializar_eventos(db, filas)

        return {"success": True, "eventos": eventos}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error en get_mis_registros: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 7: Run all tests to verify they pass**

Run: `python -m pytest test/test_eventos_registro.py -v`
Expected: PASS (all 8 tests)

Also re-run every other eventos-touching test to confirm the refactor didn't break anything:

Run: `python -m pytest test/test_avistamiento_foto_url.py test/test_subir_foto_avistamiento.py test/test_eventos_registro.py test/test_health_endpoint.py -v`
Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add app/routers/eventos.py test/test_eventos_registro.py
git commit -m "feat: registro de asistencia a eventos (RSVP), conteo real en listado"
```

---

### Task 2: Mobile — `client.js` functions

**Files:**
- Modify: `MockupsSwayMobile/src/api/client.js`

**Interfaces:**
- Consumes: Task 1's 3 endpoints.
- Produces: `registrarAsistencia(eventoId)`, `cancelarAsistencia(eventoId)`, `getMisEventosRegistrados()` — all exported, all following the exact `apiFetch`/`authHeaders`/`buildErrorResult` pattern every other function in this file uses.

- [ ] **Step 1: Add the 3 functions**

Insert after the existing `deleteEvento` function (after its closing `}`, before `export async function getTiposEvento()`):

```javascript
export async function registrarAsistencia(eventoId) {
  try {
    const res = await apiFetch(`${API_HOST}/api/eventos/${eventoId}/registrar`, {
      method: 'POST',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al confirmar tu asistencia');
    return data;
  } catch (error) {
    console.error('Error en registrarAsistencia:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function cancelarAsistencia(eventoId) {
  try {
    const res = await apiFetch(`${API_HOST}/api/eventos/${eventoId}/registrar`, {
      method: 'DELETE',
      headers: await authHeaders(),
    });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al cancelar tu asistencia');
    return data;
  } catch (error) {
    console.error('Error en cancelarAsistencia:', error);
    return { success: false, message: 'No se pudo conectar con el servidor' };
  }
}

export async function getMisEventosRegistrados() {
  try {
    const res = await apiFetch(`${API_HOST}/api/eventos/mis-registros`, { headers: await authHeaders() });
    const data = await res.json();
    if (!res.ok) return buildErrorResult(res, data, 'Error al obtener tus eventos registrados');
    return data;
  } catch (error) {
    console.error('Error en getMisEventosRegistrados:', error);
    return { success: false, eventos: [] };
  }
}
```

- [ ] **Step 2: Manual verification**

No automated mobile tests exist in this repo. Verify by re-reading the diff: each function must mirror `deleteEvento`'s exact error-handling shape (`buildErrorResult` on non-ok response, `{success: false, message: ...}` on network exception).

- [ ] **Step 3: Commit**

```bash
git add MockupsSwayMobile/src/api/client.js
git commit -m "feat: cliente movil para registro de asistencia a eventos"
```

---

### Task 3: Mobile — `EventsScreen.js` (RSVP button, real capacity, link to new screen)

**Files:**
- Modify: `MockupsSwayMobile/src/screens/EventsScreen.js`

**Interfaces:**
- Consumes: Task 2's `registrarAsistencia`, `cancelarAsistencia`, `getMisEventosRegistrados`.
- Produces: nothing new consumed elsewhere — this task is UI-only, wiring existing pieces together.

- [ ] **Step 1: Import the 3 new client functions**

Update the import line (currently):
```javascript
import { getEventos, getEventosMine, getTiposEvento, getModalidades, crearEvento, deleteEvento } from '../api/client';
```
to:
```javascript
import { getEventos, getEventosMine, getTiposEvento, getModalidades, crearEvento, deleteEvento, registrarAsistencia, cancelarAsistencia, getMisEventosRegistrados } from '../api/client';
```

- [ ] **Step 2: Accept the `navigation` prop**

Change the component signature from:
```javascript
export default function EventsScreen() {
```
to:
```javascript
export default function EventsScreen({ navigation }) {
```
(React Navigation already injects this prop automatically since `EventsScreen` is registered as a `Tab.Screen` in `AppNavigator.js` — it was just never destructured before.)

- [ ] **Step 3: Wire `registrados` into `mapEventoFromApi`'s `participants` field**

Replace:
```javascript
    participants: 0,
```
with:
```javascript
    participants: e.registrados || 0,
```
(This was hardcoded to `0` before — Task 1 made the real count available.)

- [ ] **Step 4: Add `misRegistros` state and fetch it alongside events**

Add the new state right after `const [modalidades, setModalidades] = useState([]);`:
```javascript
  const [misRegistros, setMisRegistros] = useState(new Set());
```

Replace the entire `useFocusEffect` block (from `useFocusEffect(` through its closing `);`) with:
```javascript
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const fetchEvents = showMineOnly ? getEventosMine : getEventos;
      Promise.all([fetchEvents(), getMisEventosRegistrados()]).then(([data, misData]) => {
        if (!active) return;
        if (data?.sessionExpired) {
          setIsLoggedIn(false);
          return;
        }
        const mapped = sortEventos(data?.eventos ? data.eventos.map(mapEventoFromApi) : []);
        setEvents(mapped);
        if (misData?.eventos) {
          setMisRegistros(new Set(misData.eventos.map((e) => String(e.id))));
        }

        const currentIds = new Set(mapped.map((e) => e.id));
        if (seenEventIds === null) {
          seenEventIds = currentIds;
        } else {
          const nuevos = mapped.filter((e) => e.status === 'UPCOMING' && !seenEventIds.has(e.id));
          if (nuevos.length) {
            celebrate({
              icon: 'calendar',
              title: 'Nuevo evento próximo',
              message: nuevos[0].name,
            });
          }
          seenEventIds = currentIds;
        }
      });
      return () => {
        active = false;
      };
    }, [showMineOnly, celebrate])
  );
```

- [ ] **Step 5: Remove `incrementEventAttended()` from `handleCreateEvent`**

In `handleCreateEvent`, remove this line (organizing an event no longer credits the attendance badges):
```javascript
    incrementEventAttended();
```
Leave `bumpStreak();` in place — only the attendance-badge increment moves, the streak stays tied to organizing too.

- [ ] **Step 6: Add the RSVP toggle handler**

Add this new function right after `handleDelete` (after its closing `};`):
```javascript
  const handleToggleAsistencia = async () => {
    if (!detailEvent) return;
    const isRegistered = misRegistros.has(detailEvent.id);
    const result = isRegistered
      ? await cancelarAsistencia(detailEvent.id)
      : await registrarAsistencia(detailEvent.id);
    if (result?.sessionExpired) {
      setIsLoggedIn(false);
      return;
    }
    if (!result.success) {
      hapticError();
      Alert.alert('Error', result.message || 'No se pudo actualizar tu asistencia.');
      return;
    }
    hapticSuccess();
    if (!isRegistered) {
      incrementEventAttended();
    }
    const [refreshed, misRegistradosData] = await Promise.all([
      showMineOnly ? getEventosMine() : getEventos(),
      getMisEventosRegistrados(),
    ]);
    if (refreshed?.eventos) {
      setEvents(sortEventos(refreshed.eventos.map(mapEventoFromApi)));
    }
    if (misRegistradosData?.eventos) {
      setMisRegistros(new Set(misRegistradosData.eventos.map((e) => String(e.id))));
    }
  };
```

- [ ] **Step 7: Add the RSVP button to the detail modal**

In the detail modal's `<ScrollView style={styles.modalBody}>` block, insert the button right after the `detailGrid` closing `</View>` and before `<Text style={styles.detailSection}>Descripción</Text>`:

```javascript
                {detailEvent.status === 'UPCOMING' && (
                  <TouchableOpacity
                    style={[
                      styles.asistenciaBtn,
                      misRegistros.has(detailEvent.id) && styles.asistenciaBtnActive,
                    ]}
                    onPress={handleToggleAsistencia}
                  >
                    <Ionicons
                      name={misRegistros.has(detailEvent.id) ? 'checkmark-circle' : 'checkmark-circle-outline'}
                      size={18}
                      color={misRegistros.has(detailEvent.id) ? colors.red : '#fff'}
                    />
                    <Text
                      style={[
                        styles.asistenciaBtnText,
                        misRegistros.has(detailEvent.id) && styles.asistenciaBtnTextActive,
                      ]}
                    >
                      {misRegistros.has(detailEvent.id) ? 'Cancelar asistencia' : 'Asistiré'}
                    </Text>
                  </TouchableOpacity>
                )}
```

- [ ] **Step 8: Add the "Voy a asistir" link**

Insert right after the filters `<ScrollView horizontal ...>` closing `</ScrollView>` (the one containing the "Todos"/status/"Míos" chips) and before the "Crear evento" `<TouchableOpacity style={styles.newBtn}>`:

```javascript
        <TouchableOpacity
          style={styles.misAsistenciasLink}
          onPress={() => navigation.navigate('MisAsistencias')}
        >
          <Ionicons name="checkmark-done-outline" size={14} color={colors.blue} />
          <Text style={styles.misAsistenciasLinkText}>Voy a asistir</Text>
        </TouchableOpacity>
```

- [ ] **Step 9: Add the new styles**

Add to the `StyleSheet.create({...})` object, anywhere after `newBtnText` and before `card`:
```javascript
  misAsistenciasLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    marginBottom: 10,
  },
  misAsistenciasLinkText: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.blue,
  },
```

Add to the `StyleSheet.create({...})` object, anywhere after `detailGrid`/`detailItem`/`detailValue` and before `detailSection`:
```javascript
  asistenciaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    backgroundColor: colors.blue,
    borderRadius: radii.r12,
    marginBottom: 16,
  },
  asistenciaBtnActive: {
    backgroundColor: colors.redBg,
  },
  asistenciaBtnText: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
    color: '#fff',
  },
  asistenciaBtnTextActive: {
    color: colors.red,
  },
```

(`colors.red` and `colors.redBg` already exist in `theme/colors.js` — same tokens the "Eliminar" button in this file already uses.)

- [ ] **Step 10: Manual verification**

No automated mobile tests. Re-read the full diff for: `navigation` prop actually used only in the new `onPress`, `misRegistros` Set correctly built from string ids (matching `mapEventoFromApi`'s `id: String(e.id)`), no leftover reference to the removed `incrementEventAttended()` call in `handleCreateEvent`.

- [ ] **Step 11: Commit**

```bash
git add MockupsSwayMobile/src/screens/EventsScreen.js
git commit -m "feat: boton de asistencia en detalle de evento, conteo real de participantes"
```

---

### Task 4: Mobile — new "Voy a asistir" screen + navigation

**Files:**
- Create: `MockupsSwayMobile/src/screens/MisAsistenciasScreen.js`
- Modify: `MockupsSwayMobile/src/navigation/AppNavigator.js`

**Interfaces:**
- Consumes: `getMisEventosRegistrados`, `cancelarAsistencia` (Task 2).
- Produces: `'MisAsistencias'` as a valid `navigation.navigate()` target (consumed by Task 3's Step 8 link).

- [ ] **Step 1: Create the new screen**

```javascript
import { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii, shadows } from '../theme/spacing';
import ScreenHeader from '../components/ScreenHeader';
import { getMisEventosRegistrados, cancelarAsistencia } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { hapticError, hapticWarning } from '../utils/haptics';

function todayLocalStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapEvento(e) {
  const fechaEvento = e.fecha_evento ? e.fecha_evento.slice(0, 10) : '';
  return {
    id: String(e.id),
    name: e.titulo,
    location: e.direccion || e.url_evento || e.modalidad || 'Por confirmar',
    time: e.hora_inicio && e.hora_fin ? `${e.hora_inicio.slice(0, 5)} - ${e.hora_fin.slice(0, 5)}` : '',
    date: fechaEvento,
    status: fechaEvento && fechaEvento < todayLocalStr() ? 'PAST' : 'UPCOMING',
  };
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return { day: d.getDate(), month: months[d.getMonth()] };
}

export default function MisAsistenciasScreen() {
  const { setIsLoggedIn } = useAuth();
  const [eventos, setEventos] = useState([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMisEventosRegistrados().then((data) => {
        if (!active) return;
        if (data?.sessionExpired) {
          setIsLoggedIn(false);
          return;
        }
        setEventos(data?.eventos ? data.eventos.map(mapEvento) : []);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const handleCancelar = (item) => {
    Alert.alert(
      'Cancelar asistencia',
      `¿Cancelar tu asistencia a "${item.name}"?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Cancelar asistencia',
          style: 'destructive',
          onPress: async () => {
            const result = await cancelarAsistencia(item.id);
            if (result?.sessionExpired) {
              setIsLoggedIn(false);
              return;
            }
            if (!result.success) {
              hapticError();
              Alert.alert('Error', result.message || 'No se pudo cancelar tu asistencia.');
              return;
            }
            hapticWarning();
            const refreshed = await getMisEventosRegistrados();
            if (refreshed?.eventos) {
              setEventos(refreshed.eventos.map(mapEvento));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Voy a asistir" subtitle={`${eventos.length} eventos`} hideLogo showBack />

        {eventos.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={44} color={colors.text3} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Sin eventos confirmados</Text>
            <Text style={styles.emptyDesc}>
              Confirma tu asistencia a un evento próximo desde la pantalla de Eventos.
            </Text>
          </View>
        ) : (
          eventos.map((item) => {
            const { day, month } = formatDate(item.date);
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.dateBlock}>
                    <Text style={styles.dateMonth}>{month}</Text>
                    <Text style={styles.dateDay}>{day}</Text>
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={12} color={colors.text3} />
                      <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="time-outline" size={12} color={colors.text3} />
                      <Text style={styles.metaText}>{item.time}</Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancelar(item)}>
                  <Ionicons name="close-circle-outline" size={14} color={colors.red} />
                  <Text style={styles.cancelBtnText}>Cancelar asistencia</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 40, paddingHorizontal: 20, paddingBottom: 32 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    marginBottom: 14,
    ...shadows.xs,
    overflow: 'hidden',
  },
  cardRow: { flexDirection: 'row', padding: 14, gap: 14 },
  dateBlock: {
    width: 52,
    height: 60,
    backgroundColor: colors.oceanLight,
    borderRadius: radii.r12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateMonth: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: typography.weight.bold,
    color: colors.ocean,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dateDay: {
    fontFamily: typography.display,
    fontSize: 20,
    fontWeight: typography.weight.extrabold,
    color: colors.oceanDark,
    lineHeight: 22,
  },
  cardContent: { flex: 1, gap: 6 },
  cardName: {
    fontFamily: typography.display,
    fontSize: 14,
    fontWeight: typography.weight.bold,
    color: colors.text,
    letterSpacing: -0.2,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontFamily: typography.body, fontSize: 12, color: colors.text2, flex: 1 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelBtnText: {
    fontFamily: typography.display,
    fontSize: 11,
    fontWeight: typography.weight.semibold,
    color: colors.red,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 4 },
  emptyTitle: {
    fontFamily: typography.display,
    fontSize: 18,
    fontWeight: typography.weight.semibold,
    color: colors.text2,
  },
  emptyDesc: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text3,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
    marginTop: 4,
  },
});
```

Save as `MockupsSwayMobile/src/screens/MisAsistenciasScreen.js`.

- [ ] **Step 2: Register the screen in `AppNavigator.js`**

Add the import (after `import NotificationsScreen from '../screens/NotificationsScreen';`):
```javascript
import MisAsistenciasScreen from '../screens/MisAsistenciasScreen';
```

Add the `Stack.Screen` entry (inside the `isLoggedIn` branch, after `<Stack.Screen name="Notifications" component={NotificationsScreen} />`):
```javascript
            <Stack.Screen name="MisAsistencias" component={MisAsistenciasScreen} />
```

- [ ] **Step 3: Manual verification**

No automated mobile tests. Confirm `'MisAsistencias'` is the exact string used both in `AppNavigator.js`'s `Stack.Screen name=` and in Task 3 Step 8's `navigation.navigate('MisAsistencias')` — a typo here fails silently at runtime (React Navigation just does nothing / warns in the console), not a caught error.

- [ ] **Step 4: Commit**

```bash
git add MockupsSwayMobile/src/screens/MisAsistenciasScreen.js MockupsSwayMobile/src/navigation/AppNavigator.js
git commit -m "feat: nueva pantalla Voy a asistir, listado de eventos registrados"
```

---

### Task 5: Mobile — `GamificationContext.js` badge source switch

**Files:**
- Modify: `MockupsSwayMobile/src/context/GamificationContext.js`

**Interfaces:**
- Consumes: `getMisEventosRegistrados` (Task 2).
- Produces: `counters.eventsAttended` (renamed from `counters.eventsOrganized`) — consumed only within this same file (badges array), no other file reads `counters` directly.

- [ ] **Step 1: Update the import**

Replace:
```javascript
import { getAvistamientosMine, getEventosMine, getEspecies, getProfile, isBiometricLoginEnabled } from '../api/client';
```
with:
```javascript
import { getAvistamientosMine, getMisEventosRegistrados, getEspecies, getProfile, isBiometricLoginEnabled } from '../api/client';
```

- [ ] **Step 2: Rename the seed field**

Replace:
```javascript
const seed = {
  sightings: 0,
  photoSightings: 0,
  species: 0,
  eventsOrganized: 0,
  approved: false,
  biometricEnabled: false,
};
```
with:
```javascript
const seed = {
  sightings: 0,
  photoSightings: 0,
  species: 0,
  eventsAttended: 0,
  approved: false,
  biometricEnabled: false,
};
```

- [ ] **Step 3: Switch the fetch source in the real-data effect**

Replace:
```javascript
    let active = true;
    Promise.all([
      getAvistamientosMine(),
      getEventosMine(),
      getEspecies(),
      getProfile(),
      isBiometricLoginEnabled(),
    ]).then(([avistamientosData, eventosData, especiesData, profileData, biometricEnabled]) => {
      if (!active) return;
      const avistamientos = avistamientosData?.success ? avistamientosData.avistamientos || [] : [];
      setCounters({
        sightings: avistamientos.length,
        photoSightings: avistamientos.filter((a) => a.foto_url).length,
        species: especiesData?.success ? (especiesData.especies || []).length : 0,
        eventsOrganized: eventosData?.success ? (eventosData.eventos || []).length : 0,
        approved: profileData?.colaborador?.estado_solicitud === 'aprobada',
        biometricEnabled: !!biometricEnabled,
      });
    });
```
with:
```javascript
    let active = true;
    Promise.all([
      getAvistamientosMine(),
      getMisEventosRegistrados(),
      getEspecies(),
      getProfile(),
      isBiometricLoginEnabled(),
    ]).then(([avistamientosData, eventosData, especiesData, profileData, biometricEnabled]) => {
      if (!active) return;
      const avistamientos = avistamientosData?.success ? avistamientosData.avistamientos || [] : [];
      setCounters({
        sightings: avistamientos.length,
        photoSightings: avistamientos.filter((a) => a.foto_url).length,
        species: especiesData?.success ? (especiesData.especies || []).length : 0,
        eventsAttended: eventosData?.success ? (eventosData.eventos || []).length : 0,
        approved: profileData?.colaborador?.estado_solicitud === 'aprobada',
        biometricEnabled: !!biometricEnabled,
      });
    });
```

- [ ] **Step 4: Rename the increment function's target field**

Replace:
```javascript
  // no attendance/RSVP feature exists anywhere in the app — "eventsAttended"
  // is redefined as events the user organized (the only real per-user event
  // count available), bumped after a successful crearEvento.
  const incrementEventAttended = () =>
    setCounters((c) => ({ ...c, eventsOrganized: c.eventsOrganized + 1 }));
```
with:
```javascript
  // Real RSVP feature now exists — this increments on a successful
  // registrarAsistencia call (EventsScreen.js), not on organizing an event.
  const incrementEventAttended = () =>
    setCounters((c) => ({ ...c, eventsAttended: c.eventsAttended + 1 }));
```

- [ ] **Step 5: Update the badges array**

Replace:
```javascript
        { label: 'Primer evento', icon: 'megaphone-outline', current: counters.eventsOrganized, goal: 1 },
```
with:
```javascript
        { label: 'Primer evento', icon: 'megaphone-outline', current: counters.eventsAttended, goal: 1 },
```

Replace:
```javascript
        { label: 'Voluntario activo', icon: 'people-outline', current: counters.eventsOrganized, goal: 3 },
```
with:
```javascript
        { label: 'Voluntario activo', icon: 'people-outline', current: counters.eventsAttended, goal: 3 },
```

- [ ] **Step 6: Manual verification**

No automated mobile tests. Re-read the file end to end — grep for `eventsOrganized` to confirm zero remaining references (every one must now read `eventsAttended`), and confirm `getEventosMine` isn't still imported unused (it should be fully replaced by `getMisEventosRegistrados`, not both).

- [ ] **Step 7: Commit**

```bash
git add MockupsSwayMobile/src/context/GamificationContext.js
git commit -m "feat: logros de eventos ahora cuentan asistencia real, no organizacion"
```

---

## Deployment note (not part of any task's automated steps)

Task 1 changes the backend. After all 5 tasks are merged: `git push origin master`, SSH to the private droplet, `git pull`, `docker compose -f docker-compose.private.yml up -d --build api1 api2`. No DB migration needed — `RegistroEvento` already exists in the schema, nothing new to `ALTER TABLE`.
