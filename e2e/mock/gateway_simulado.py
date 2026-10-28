"""Gateway SIMULADO de LogiTrack (fase 2) para las pruebas de la interfaz.

Responde como dice CONTRATO_API.md (secciones 1-9) con datos en memoria: inicio de sesión con roles,
cotizar -> crear con precio en COP, pedidos divididos, programados, cancelar/reprogramar, pagos,
facturas por pedido, reembolsos e ingresos. NO es el backend: solo sirve para probar la interfaz sin
depender de Render. Las cuentas de prueba (contraseñas de prueba, solo aquí) están en CUENTAS.

    python e2e/mock/gateway_simulado.py            # escucha en http://localhost:8002

Rutas de control (solo pruebas): POST /__mock/reiniciar, /__mock/dormir?n=, /__mock/tarifa?base=,
/__mock/expirar, /__mock/avanzar (pasa los pendientes a asignado).
"""
import math
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

BOGOTA = timezone(timedelta(hours=-5))
MAX_PARTES = 10

CUENTAS = {
    "admin@logitrack.test": ("prueba-admin-1", "administrador", "Laura Administradora"),
    "operador@logitrack.test": ("prueba-oper-1", "operador", "Óscar Operador"),
    "gestor@logitrack.test": ("prueba-gest-1", "gestor_flota", "Gina Gestora"),
    "cliente@logitrack.test": ("prueba-clie-1", "cliente", "Carlos Cliente"),
}

C, O, G, A = "cliente", "operador", "gestor_flota", "administrador"
TODOS = (C, O, G, A)
ID = r"[^/]+"


def _p(metodos, patron, *roles):
    return (set(metodos.split(",")), re.compile(rf"^/{patron}/?$"), set(roles))


PERMISOS = [
    _p("GET,POST,PATCH", rf"usuarios(/{ID})?", A),
    _p("GET", rf"clientes(/codigo/{ID}|/{ID})?", C, O, A),
    _p("POST,PATCH", rf"clientes(/{ID})?", O, A),
    _p("GET", rf"ubicaciones(/paises|/codigo/{ID}|/{ID})?", *TODOS),
    _p("POST", r"envios/cotizar", C, O, A),
    _p("GET", r"envios/programados", O, G, A),
    _p("POST", r"envios", C, O, A),
    _p("GET", rf"envios(/codigo/{ID}|/{ID}|/{ID}/eventos|/{ID}/prueba-entrega|/{ID}/partes)?", *TODOS),
    _p("POST", rf"envios/{ID}/reintentar-asignacion", O, G, A),
    _p("PATCH", rf"envios/{ID}/estado", O, G, A),
    _p("POST", rf"envios/{ID}/cancelar", G, A),
    _p("PATCH", rf"envios/{ID}/reprogramar", G, A),
    _p("POST", r"viabilidad", C, O, A),
    _p("GET", rf"seguimiento/cliente/envio/{ID}(/trazado|/recorrido)?", C),
    _p("GET", r"(vehiculos|conductores|reservas|rutas|rutas-maestras|seguimiento|simulaciones|telemetria|programas|intervenciones)(/.*)?", O, G, A),
    _p("POST,PATCH,PUT", r"(vehiculos|conductores)(/.*)?", G, A),
    _p("GET", r"(declaraciones|notificaciones)(/.*)?", O, A),
    _p("GET,POST", rf"preferencias/{ID}", C, A),
    _p("GET", r"pagos/por-reembolsar", A),
    _p("POST", rf"pagos/{ID}/reembolsar", A),
    _p("GET", rf"pagos(/envio/{ID}|/{ID})?", C, O, A),
    _p("GET", r"cotizaciones", C, O, A),
    _p("GET", rf"facturas-pedido(/envio/{ID})?", C, A),
    _p("GET", rf"facturas(/{ID})?", C, A),
    _p("GET", r"dashboard/(utilizacion-flota|proyeccion-mantenimiento)", G, A),
    _p("GET", r"dashboard(/.*)?", A),
    _p("POST", r"etl(/.*)?", A),
    _p("GET", r"estado", A),
]

UBICACIONES = [
    {"codigo": "CO-MTR", "nombre": "Montería", "departamento": "Córdoba", "lat": 8.75, "lon": -75.88},
    {"codigo": "CO-SIN", "nombre": "Sincelejo", "departamento": "Sucre", "lat": 9.30, "lon": -75.39},
    {"codigo": "CO-CTG", "nombre": "Cartagena", "departamento": "Bolívar", "lat": 10.39, "lon": -75.51},
    {"codigo": "CO-BOG", "nombre": "Bogotá", "departamento": "Bogotá D.C.", "lat": 4.71, "lon": -74.07},
]
DISTANCIAS = {("CO-MTR", "CO-SIN"): 118.85, ("CO-MTR", "CO-CTG"): 297.0, ("CO-MTR", "CO-BOG"): 690.4, ("CO-SIN", "CO-CTG"): 186.2}
CAPACIDADES = [5000.0, 3000.0, 1000.0]  # flota simulada (kg)

E = {}  # estado en memoria


def _ahora():
    return datetime.now(timezone.utc)


def _iso(d):
    return d.isoformat().replace("+00:00", "Z") if d else None


def reiniciar():
    E.clear()
    E["tokens"] = {}
    E["registro_personal"] = True
    E["registro_intentos"] = 0
    E["registro_intentos_max"] = 20
    E["registro_con_authorization"] = False
    E["vehiculos"] = {}
    E["seg"] = {}            # envio_id -> {"escenario": str, "paso": int}
    E["seg_fallos"] = 0      # próximas N consultas del seguimiento del cliente responden 503
    E["seg_consultas"] = []  # (momento, envio_id) de cada GET /seguimiento/cliente/envio/{id}
    E["dormir"] = 0
    E["tarifa"] = {"base": 20000, "minimo": 50000, "ton_km": 280}
    E["seq_envio"] = 40
    E["seq_factura"] = 0
    E["clientes"] = {}
    for i, nombre in enumerate(["Distribuidora Andina S.A.S.", "Frutas del Sinú Ltda."], start=1):
        cid = str(uuid.uuid4())
        E["clientes"][cid] = {
            "id": cid, "codigo_cliente": 1000000000 + i, "nombre": nombre, "tipo_documento": "NIT",
            "numero_documento": f"90012345{i}", "email": f"contacto{i}@empresa.co", "telefono": None,
            "direccion": None, "activo": True, "es_historico": False, "creado_en": _iso(_ahora()),
        }
    primero = next(iter(E["clientes"].values()))
    E["usuarios"] = {}
    for email, (_, rol, nombre) in CUENTAS.items():
        uid = str(uuid.uuid4())
        E["usuarios"][uid] = {
            "id": uid, "email": email, "nombre": nombre, "rol": rol,
            "cliente_id": primero["id"] if rol == C else None,
            "codigo_cliente": primero["codigo_cliente"] if rol == C else None,
            "activo": True, "ultimo_acceso": None, "creado_en": _iso(_ahora()),
            "_password": CUENTAS[email][0],
        }
    E["ubicaciones"] = {}
    for u in UBICACIONES:
        uid = str(uuid.uuid4())
        E["ubicaciones"][uid] = {
            "id": uid, "codigo": u["codigo"], "nombre": u["nombre"], "departamento": u["departamento"],
            "pais": "Colombia", "codigo_pais": "CO", "tipo": "ciudad", "latitud": u["lat"], "longitud": u["lon"],
            "etiqueta": f"{u['nombre']}, {u['departamento']}, Colombia", "activo": True,
        }
    E["envios"] = {}
    E["eventos"] = {}
    E["pagos"] = {}
    E["facturas"] = {}
    E["cotizaciones"] = []
    for placa, ciudad, extra in (("GOQ998", "CO-MTR", {"_en_viaje": True}), ("KQA794", None, {}), ("TRK100", "CO-BOG", {})):
        _crear_vehiculo(placa, ciudad, extra)


def _publico(d):
    return {k: v for k, v in d.items() if not k.startswith("_")}


def _error(status, codigo, mensaje, **extra):
    return JSONResponse(status_code=status, content={"detail": {"codigo": codigo, "mensaje": mensaje, **extra}})


def _dec(v):
    return f"{float(v):.2f}"


app = FastAPI()


@app.middleware("http")
async def puerta(request: Request, llamar):
    ruta = request.url.path
    if request.method == "OPTIONS" or ruta.startswith("/__mock") or ruta == "/health":
        return await llamar(request)
    if E["dormir"] > 0:  # el backend "despertando" (Render)
        E["dormir"] -= 1
        return _error(503, "SERVICIO_NO_DISPONIBLE", "El servicio 'shipment' no está disponible en este momento", servicio="shipment")
    if not ruta.startswith("/api/v1/"):
        return JSONResponse(status_code=404, content={"detail": "No encontrado"})
    resto = ruta[len("/api/v1"):]
    if resto.rstrip("/") in ("/auth/login", "/auth/registro"):
        if request.headers.get("authorization"):
            E["registro_con_authorization"] = True  # el registro debe ir sin Authorization
        return await llamar(request)
    cab = request.headers.get("authorization") or ""
    if not cab.lower().startswith("bearer "):
        return _error(401, "NO_AUTENTICADO", "Inicie sesión para continuar")
    uid = E["tokens"].get(cab[7:].strip())
    if not uid or uid not in E["usuarios"]:
        return _error(401, "TOKEN_EXPIRADO", "La sesión expiró; inicie sesión de nuevo")
    u = E["usuarios"][uid]
    request.state.u = u
    if resto.rstrip("/") != "/auth/me":
        limpio = resto.rstrip("/") or "/"
        regla = next((r for r in PERMISOS if request.method in r[0] and r[1].match(limpio)), None)
        if regla is None or u["rol"] not in regla[2]:
            return _error(403, "SIN_PERMISO", "Su rol no tiene permiso para esta operación")
        if u["rol"] == C and limpio.startswith("/preferencias/") and limpio.split("/")[2] != u["cliente_id"]:
            return _error(403, "SIN_PERMISO", "Solo puede ver sus preferencias")
    respuesta = await llamar(request)
    respuesta.headers["X-Request-ID"] = secrets.token_hex(6)
    return respuesta


# ---------- control ----------
@app.post("/__mock/reiniciar")
def _reiniciar():
    reiniciar()
    return {"ok": True}


@app.post("/__mock/dormir")
def _dormir(n: int = 2):
    E["dormir"] = n
    return {"ok": True}


@app.post("/__mock/tarifa")
def _tarifa(base: int = 20000):
    E["tarifa"]["base"] = base
    return {"ok": True}


@app.post("/__mock/expirar")
def _expirar():
    E["tokens"].clear()
    return {"ok": True}


@app.post("/__mock/avanzar")
def _avanzar():
    for e in E["envios"].values():
        if e["estado"] in ("pendiente", "sin_asignacion") and not e["partes_total"]:
            _asignar(e)
    for e in E["envios"].values():
        if e["partes_total"]:
            _recalcular_padre(e)
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok", "service": "api-gateway"}


# ---------- auth y usuarios ----------
@app.post("/api/v1/auth/login")
async def login(request: Request):
    b = await request.json()
    email = str(b.get("email", "")).strip().lower()
    u = next((x for x in E["usuarios"].values() if x["email"] == email), None)
    if not u or u["_password"] != b.get("password") or not u["activo"]:
        return _error(401, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos")
    token = secrets.token_urlsafe(24)
    E["tokens"][token] = u["id"]
    u["ultimo_acceso"] = _iso(_ahora())
    return {"access_token": token, "token_type": "bearer", "expires_in": 28800, "usuario": _publico(u)}


CODIGO_ACCESO = "LT-ACCESO-2026"


@app.post("/__mock/registro")
def _registro(personal: bool = True, intentos: int = 20):
    E["registro_personal"] = personal
    E["registro_intentos_max"] = intentos
    E["registro_intentos"] = 0
    return {"ok": True, "con_authorization": E.get("registro_con_authorization", False)}


@app.post("/api/v1/auth/registro")
async def registro(request: Request):
    E["registro_intentos"] = E.get("registro_intentos", 0) + 1
    if E["registro_intentos"] > E.get("registro_intentos_max", 20):
        return _error(429, "DEMASIADOS_INTENTOS", "Demasiados intentos de registro; espere unos minutos")
    b = await request.json()
    rol = b.get("rol")
    faltan = [c for c in ("nombre", "email", "password") if not b.get(c)]
    if rol == C:
        faltan += [c for c in ("tipo_documento", "numero_documento") if not b.get(c)]
        if "codigo_cliente" in b or "codigo_acceso" in b:
            return JSONResponse(status_code=422, content={"detail": [{"loc": ["body", "codigo_cliente"], "msg": "Extra inputs are not permitted"}]})
    elif rol in (O, G):
        faltan += [c for c in ("codigo_acceso",) if not b.get(c)]
        if "numero_documento" in b:
            return JSONResponse(status_code=422, content={"detail": [{"loc": ["body", "numero_documento"], "msg": "Extra inputs are not permitted"}]})
    else:
        return JSONResponse(status_code=422, content={"detail": [{"loc": ["body", "rol"], "msg": "Input should be 'cliente', 'operador' or 'gestor_flota'"}]})
    errores = [{"loc": ["body", c], "msg": "Field required", "type": "missing"} for c in faltan]
    if b.get("password") and len(b["password"]) < 8:
        errores.append({"loc": ["body", "password"], "msg": "String should have at least 8 characters"})
    if b.get("telefono") and not str(b["telefono"]).replace("+", "").replace(" ", "").isdigit():
        errores.append({"loc": ["body", "telefono"], "msg": "Value error, El teléfono solo admite números"})
    if errores:
        return JSONResponse(status_code=422, content={"detail": errores})
    email = str(b["email"]).strip().lower()
    if rol in (O, G):
        if not E.get("registro_personal", True):
            return _error(403, "REGISTRO_PERSONAL_DESHABILITADO", "El registro de personal está deshabilitado")
        if b["codigo_acceso"] != CODIGO_ACCESO:
            return _error(403, "CODIGO_ACCESO_INVALIDO", "Código de acceso inválido")
    if any(u["email"] == email for u in E["usuarios"].values()):
        return _error(409, "CORREO_YA_REGISTRADO", "Ya existe una cuenta con ese correo")
    cliente = None
    if rol == C:
        if any(c["tipo_documento"] == b["tipo_documento"] and c["numero_documento"] == b["numero_documento"] for c in E["clientes"].values()):
            return _error(409, "CLIENTE_YA_REGISTRADO", "Ese documento ya está registrado como cliente")
        cid = str(uuid.uuid4())
        cliente = {
            "id": cid, "codigo_cliente": 1000000000 + len(E["clientes"]) + 1, "nombre": b["nombre"],
            "tipo_documento": b["tipo_documento"], "numero_documento": b["numero_documento"], "email": email,
            "telefono": b.get("telefono"), "direccion": b.get("direccion"), "activo": True, "es_historico": False,
            "creado_en": _iso(_ahora()),
        }
        E["clientes"][cid] = cliente
    uid = str(uuid.uuid4())
    u = E["usuarios"][uid] = {
        "id": uid, "email": email, "nombre": b["nombre"], "rol": rol,
        "cliente_id": cliente["id"] if cliente else None, "codigo_cliente": cliente["codigo_cliente"] if cliente else None,
        "activo": True, "ultimo_acceso": _iso(_ahora()), "creado_en": _iso(_ahora()), "_password": b["password"],
    }
    token = secrets.token_urlsafe(24)
    E["tokens"][token] = uid
    return JSONResponse(status_code=201, content={"access_token": token, "expires_in": 28800, "usuario": _publico(u)})


@app.get("/api/v1/auth/me")
def yo(request: Request):
    return _publico(request.state.u)


@app.get("/api/v1/usuarios/")
@app.get("/api/v1/usuarios")
def usuarios(rol: str | None = None):
    return [_publico(u) for u in E["usuarios"].values() if not rol or u["rol"] == rol]


@app.post("/api/v1/usuarios")
async def crear_usuario(request: Request):
    b = await request.json()
    email = str(b.get("email", "")).strip().lower()
    if any(u["email"] == email for u in E["usuarios"].values()):
        return JSONResponse(status_code=409, content={"detail": "Ya existe una cuenta con ese correo"})
    if len(b.get("password") or "") < 8:
        return JSONResponse(status_code=422, content={"detail": [{"loc": ["body", "password"], "msg": "String should have at least 8 characters"}]})
    cliente = E["clientes"].get(b.get("cliente_id") or "") or next(
        (c for c in E["clientes"].values() if b.get("codigo_cliente") is not None and c["codigo_cliente"] == b.get("codigo_cliente")), None)
    if b.get("rol") == C and not cliente:
        return JSONResponse(status_code=422, content={"detail": "Una cuenta de cliente necesita cliente_id o codigo_cliente"})
    uid = str(uuid.uuid4())
    E["usuarios"][uid] = {
        "id": uid, "email": email, "nombre": b["nombre"], "rol": b["rol"],
        "cliente_id": cliente["id"] if cliente else None, "codigo_cliente": cliente["codigo_cliente"] if cliente else None,
        "activo": True, "ultimo_acceso": None, "creado_en": _iso(_ahora()), "_password": b["password"],
    }
    return JSONResponse(status_code=201, content=_publico(E["usuarios"][uid]))


@app.patch("/api/v1/usuarios/{uid}")
async def editar_usuario(uid: str, request: Request):
    u = E["usuarios"].get(uid)
    if not u:
        return JSONResponse(status_code=404, content={"detail": "Usuario no encontrado"})
    b = await request.json()
    if b.get("nombre"):
        u["nombre"] = b["nombre"]
    if b.get("password"):
        u["_password"] = b["password"]
    if b.get("activo") is not None:
        u["activo"] = bool(b["activo"])
    return _publico(u)


# ---------- catálogos ----------
@app.get("/api/v1/clientes")
@app.get("/api/v1/clientes/")
def clientes(request: Request, q: str | None = None, activo: bool | None = None):
    u = request.state.u
    lista = list(E["clientes"].values())
    if u["rol"] == C:
        lista = [c for c in lista if c["id"] == u["cliente_id"]]
    if q:
        lista = [c for c in lista if q.lower() in c["nombre"].lower() or q in str(c["codigo_cliente"])]
    if activo is not None:
        lista = [c for c in lista if c["activo"] == activo]
    return lista


@app.get("/api/v1/clientes/{cid}")
def cliente(cid: str, request: Request):
    c = E["clientes"].get(cid)
    if not c or (request.state.u["rol"] == C and cid != request.state.u["cliente_id"]):
        return JSONResponse(status_code=404, content={"detail": "Cliente no encontrado"})
    return c


@app.get("/api/v1/ubicaciones")
@app.get("/api/v1/ubicaciones/")
def ubicaciones(q: str | None = None, pais: str | None = None, limite: int = 25):
    lista = list(E["ubicaciones"].values())
    if q:
        lista = [u for u in lista if q.lower()[:4] in u["nombre"].lower() or q.upper() == u["codigo"]]
    return lista


@app.get("/api/v1/ubicaciones/paises")
def paises():
    return [{"codigo_pais": "CO", "pais": "Colombia", "total": len(E["ubicaciones"])}]


@app.post("/api/v1/viabilidad")
async def viabilidad(request: Request):
    b = await request.json()
    return _viabilidad(float(b["peso_kg"]), bool(b.get("es_divisible")))


# ---------- reglas simuladas ----------
def _plan(peso):
    mayor = max(CAPACIDADES)
    k = math.ceil(peso / mayor)
    if k > MAX_PARTES:
        return k, None
    partes, resto = [], peso
    for i in range(1, k + 1):
        p = round(min(mayor, resto), 2)
        resto = round(resto - p, 2)
        partes.append({"parte_numero": i, "peso_kg": p, "capacidad_vehiculo_kg": mayor})
    return k, partes


def _viabilidad(peso, divisible):
    mayor = max(CAPACIDADES)
    if peso <= mayor:
        return {"viable": True, "causa": None, "mensaje": None, "compatibles": 3, "disponibles_ahora": 2,
                "requiere_division": False, "division_posible": False, "capacidad_maxima_kg": mayor, "partes": None, "desperdicio_kg": None}
    k, partes = _plan(peso)
    base = {"compatibles": 0, "disponibles_ahora": 0, "requiere_division": True, "division_posible": partes is not None,
            "capacidad_maxima_kg": mayor, "partes": partes, "desperdicio_kg": round(k * mayor - peso, 2) if partes else None}
    if divisible and partes:
        return {**base, "viable": True, "causa": None, "mensaje": None, "compatibles": 3}
    if divisible:
        return {**base, "viable": False, "causa": "DEMASIADAS_PARTES", "mensaje": f"Dividir {peso:g} kg necesitaría {k} vehículos y el máximo por pedido es {MAX_PARTES}"}
    return {**base, "viable": False, "causa": "CARGA_INDIVISIBLE_EXCEDE_CAPACIDAD",
            "mensaje": f"Ningún vehículo puede transportar {peso:g} kg (la mayor capacidad de la flota es {mayor:g} kg). Si la carga se puede repartir, márquela como divisible"}


def _precio(peso, km):
    t = E["tarifa"]
    ton = round(peso / 1000, 3)
    variable = round(ton * km * t["ton_km"])
    calc = t["base"] + variable
    monto = max(t["minimo"], calc)
    return monto, {"base_cop": t["base"], "toneladas": ton, "distancia_km": km, "cop_por_ton_km": t["ton_km"],
                   "variable_cop": variable, "minimo_cop": t["minimo"], "aplico_minimo": calc < t["minimo"]}


def _fecha(valor):
    if not valor:
        return None
    d = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=BOGOTA)


def _preparar(b, u):
    if u["rol"] == C:
        cliente = E["clientes"][u["cliente_id"]]
    else:
        cliente = E["clientes"].get(b.get("cliente_id") or "") or next(
            (c for c in E["clientes"].values() if c["codigo_cliente"] == b.get("codigo_cliente")), None)
        if not cliente:
            return None, JSONResponse(status_code=422, content={"detail": "El cliente no existe. Regístrelo primero en POST /clientes/"})
    o = E["ubicaciones"].get(b.get("origen_id") or "")
    d = E["ubicaciones"].get(b.get("destino_id") or "")
    if not o or not d or o["id"] == d["id"]:
        return None, JSONResponse(status_code=422, content={"detail": "Origen o destino inexistentes, inactivos o iguales"})
    km = DISTANCIAS.get((o["codigo"], d["codigo"])) or DISTANCIAS.get((d["codigo"], o["codigo"])) or 400.0
    fp = _fecha(b.get("fecha_programada"))
    if fp is not None:
        if fp < _ahora() + timedelta(minutes=1):
            return None, _error(422, "FECHA_PROGRAMADA_PASADA", "La fecha programada debe ser futura")
        if fp > _ahora() + timedelta(days=365):
            return None, _error(422, "FECHA_PROGRAMADA_LEJANA", "La fecha programada no puede pasar de un año")
    peso = float(b["peso_kg"])
    v = _viabilidad(peso, bool(b.get("es_divisible")))
    return {"cliente": cliente, "o": o, "d": d, "km": km, "fp": fp, "peso": peso, "v": v}, None


@app.post("/api/v1/envios/cotizar")
async def cotizar(request: Request):
    b = await request.json()
    x, err = _preparar(b, request.state.u)
    if err:
        return err
    v = x["v"]
    puede = v["viable"]
    monto, desglose = _precio(x["peso"], x["km"]) if puede else (None, None)
    cot = None
    if puede:
        cot = {"cotizacion_id": str(uuid.uuid4()), "monto_cop": _dec(monto), "moneda": "COP", "desglose": desglose}
        E["cotizaciones"].append({"id": cot["cotizacion_id"], "cliente_id": x["cliente"]["id"], "origen": x["o"]["etiqueta"],
                                  "destino": x["d"]["etiqueta"], "distancia_km": _dec(x["km"]), "peso_kg": _dec(x["peso"]),
                                  "monto_cop": _dec(monto), "moneda": "COP", "envio_id": None, "creado_en": _iso(_ahora())})
    n = len(v["partes"]) if v.get("partes") and b.get("es_divisible") and puede else 0
    return {
        "origen": x["o"]["etiqueta"], "destino": x["d"]["etiqueta"], "codigo_ruta": "RUT-00000007",
        "distancia_km": _dec(x["km"]), "duracion_horas": _dec(x["km"] / 60), "es_internacional": False,
        "peso_kg": _dec(x["peso"]), "es_divisible": bool(b.get("es_divisible")), "fecha_programada": _iso(x["fp"]),
        "monto_cop": _dec(monto) if monto is not None else None, "moneda": "COP", "cotizacion": cot, "viabilidad": v,
        "puede_crear": puede,
        "aviso": f"La carga se dividirá en {n} envíos (uno por vehículo); el precio es el del pedido completo" if n else None,
        "facturacion_activa": True,
    }


def _nuevo_envio(x, b, peso, codigo, padre=None, parte=None):
    eid = str(uuid.uuid4())
    e = {
        "id": eid, "codigo_envio": codigo, "cliente_id": x["cliente"]["id"], "codigo_cliente": x["cliente"]["codigo_cliente"],
        "origen": x["o"]["etiqueta"], "destino": x["d"]["etiqueta"], "origen_id": x["o"]["id"], "destino_id": x["d"]["id"],
        "codigo_pais_origen": "CO", "codigo_pais_destino": "CO",
        "estado": "programado" if x["fp"] else "pendiente", "fecha_limite_sla": None, "es_internacional": False,
        "tipo_carga": b.get("tipo_carga") or "general", "es_hazmat": bool(b.get("es_hazmat")), "peso_kg": _dec(peso),
        "volumen_m3": None, "ruta_maestra_id": None, "codigo_ruta": "RUT-00000007", "distancia_km": _dec(x["km"]),
        "duracion_horas": _dec(x["km"] / 60), "vehiculo_id": None, "ruta_id": None, "placa_vehiculo": None,
        "tipo_vehiculo": None, "conductor_id": None, "conductor_nombre": None, "codigo_conductor": None,
        "hora_estimada_llegada": None, "motivo_sin_asignacion": None, "envio_padre_id": padre, "parte_numero": parte,
        "partes_total": None, "partes_entregadas": None, "es_divisible": bool(b.get("es_divisible")),
        "fecha_programada": _iso(x["fp"]), "monto_cop": None, "creado_en": _iso(_ahora()), "actualizado_en": _iso(_ahora()),
    }
    E["envios"][eid] = e
    E["eventos"][eid] = [{"id": str(uuid.uuid4()), "tipo_evento": e["estado"] if x["fp"] else "creado",
                          "notas": "ruta RUT-00000007", "fecha_hora": _iso(_ahora())}]
    return e


def _asignar(e):
    e["estado"] = "asignado"
    e["placa_vehiculo"] = "GOQ998"
    e["tipo_vehiculo"] = "camion"
    e["conductor_nombre"] = "Andrés Pérez"
    e["hora_estimada_llegada"] = _iso(_ahora() + timedelta(hours=2))
    E["eventos"][e["id"]].append({"id": str(uuid.uuid4()), "tipo_evento": "asignado", "notas": "vehículo GOQ998", "fecha_hora": _iso(_ahora())})


AVANCE = {"programado": 0, "pendiente": 1, "sin_asignacion": 2, "asignado": 3, "retenido_aduana": 4, "en_transito": 5,
          "con_incidencia": 6, "entregado": 7, "devuelto": 7}


def _recalcular_padre(p):
    partes = [x["estado"] for x in E["envios"].values() if x["envio_padre_id"] == p["id"] and x["estado"] != "cancelado"]
    p["partes_entregadas"] = sum(1 for s in partes if s == "entregado")
    if not partes:
        p["estado"] = "cancelado"
    elif all(s == "entregado" for s in partes):
        p["estado"] = "entregado"
    else:
        p["estado"] = max(partes, key=lambda s: AVANCE.get(s, 0))


@app.post("/api/v1/envios")
@app.post("/api/v1/envios/")
async def crear(request: Request):
    b = await request.json()
    x, err = _preparar(b, request.state.u)
    if err:
        return err
    v = x["v"]
    if not v["viable"]:
        return _error(422, v["causa"], v["mensaje"])
    monto, _ = _precio(x["peso"], x["km"])
    if b.get("monto_aceptado_cop") is None:
        return _error(422, "PRECIO_NO_ACEPTADO", "Cotice y acepte el precio primero", monto_actual_cop=_dec(monto))
    if abs(float(b["monto_aceptado_cop"]) - monto) > 0.5:
        return _error(409, "PRECIO_CAMBIO", "El precio cambió; vuelva a cotizar", monto_aceptado_cop=_dec(b["monto_aceptado_cop"]), monto_actual_cop=_dec(monto))
    E["seq_envio"] += 1
    codigo = f"ENV-{E['seq_envio']:08d}"
    partes = v["partes"] if v.get("requiere_division") and b.get("es_divisible") else None
    padre = _nuevo_envio(x, b, x["peso"], codigo)
    padre["monto_cop"] = _dec(monto)
    if partes:
        padre["partes_total"] = len(partes)
        padre["partes_entregadas"] = 0
        for p in partes:
            _nuevo_envio(x, b, p["peso_kg"], f"{codigo}-P{p['parte_numero']}", padre["id"], p["parte_numero"])
    E["seq_factura"] += 1
    pid = str(uuid.uuid4())
    E["pagos"][pid] = {"id": pid, "envio_id": padre["id"], "codigo_envio": codigo, "cliente_id": x["cliente"]["id"],
                       "monto_cop": _dec(monto), "moneda": "COP", "estado": "confirmado", "metodo": "simulado",
                       "referencia": f"SIM-{secrets.token_hex(4).upper()}", "creado_en": _iso(_ahora()),
                       "confirmado_en": _iso(_ahora()), "reembolsado_en": None, "_solicitud": None}
    fid = str(uuid.uuid4())
    E["facturas"][fid] = {"id": fid, "numero": f"FP-{E['seq_factura']:08d}", "pago_id": pid, "envio_id": padre["id"],
                          "codigo_envio": codigo, "cliente_id": x["cliente"]["id"], "concepto": f"Transporte de carga, pedido {codigo}",
                          "monto_cop": _dec(monto), "moneda": "COP", "estado": "emitida", "emitida_en": _iso(_ahora()), "anulada_en": None}
    return JSONResponse(status_code=201, content=padre)


def _visible(e, u):
    return u["rol"] != C or e["cliente_id"] == u["cliente_id"]


@app.get("/api/v1/envios")
@app.get("/api/v1/envios/")
def envios(request: Request, estado: str | None = None, cliente_id: str | None = None, solo_pedidos: bool = False):
    u = request.state.u
    lista = [e for e in E["envios"].values() if _visible(e, u)]
    if solo_pedidos:
        lista = [e for e in lista if not e["envio_padre_id"]]
    if estado:
        lista = [e for e in lista if e["estado"] == estado]
    if cliente_id:
        lista = [e for e in lista if e["cliente_id"] == cliente_id]
    return sorted(lista, key=lambda e: e["creado_en"], reverse=True)


@app.get("/api/v1/envios/programados")
def programados(incluir_activados: bool = False, desde: str | None = None, hasta: str | None = None):
    lista = [e for e in E["envios"].values() if e["fecha_programada"] and not e["envio_padre_id"]]
    if not incluir_activados:
        lista = [e for e in lista if e["estado"] == "programado"]
    if hasta:
        lista = [e for e in lista if _fecha(e["fecha_programada"]) <= _fecha(hasta)]
    return sorted(lista, key=lambda e: e["fecha_programada"])


def _envio_o_404(eid, u):
    e = E["envios"].get(eid)
    if not e or not _visible(e, u):
        return None
    return e


@app.get("/api/v1/envios/{eid}")
def envio(eid: str, request: Request):
    e = _envio_o_404(eid, request.state.u)
    return e or JSONResponse(status_code=404, content={"detail": "Envío no encontrado"})


@app.get("/api/v1/envios/{eid}/eventos")
def eventos(eid: str, request: Request):
    e = _envio_o_404(eid, request.state.u)
    return E["eventos"].get(eid, []) if e else JSONResponse(status_code=404, content={"detail": "Envío no encontrado"})


@app.get("/api/v1/envios/{eid}/partes")
def partes(eid: str, request: Request):
    if not _envio_o_404(eid, request.state.u):
        return JSONResponse(status_code=404, content={"detail": "Envío no encontrado"})
    return sorted([e for e in E["envios"].values() if e["envio_padre_id"] == eid], key=lambda e: e["parte_numero"])


@app.get("/api/v1/envios/{eid}/prueba-entrega")
def prueba(eid: str):
    return JSONResponse(status_code=404, content={"detail": "Este envío aún no tiene prueba de entrega"})


@app.post("/api/v1/envios/{eid}/cancelar")
async def cancelar(eid: str, request: Request):
    e = E["envios"].get(eid)
    if not e:
        return JSONResponse(status_code=404, content={"detail": "Envío no encontrado"})
    if e["envio_padre_id"]:
        return _error(409, "PARTE_DE_PEDIDO", "Se cancela el pedido completo", envio_padre_id=e["envio_padre_id"])
    hijos = [x for x in E["envios"].values() if x["envio_padre_id"] == eid]
    en_curso = [x["codigo_envio"] for x in hijos if x["estado"] not in ("programado", "pendiente", "sin_asignacion", "cancelado")]
    if en_curso:
        return _error(409, "NO_SE_PUEDE_CANCELAR", "Alguna parte ya tiene vehículo en camino", partes_en_curso=en_curso)
    if e["estado"] not in ("programado", "pendiente", "sin_asignacion"):
        return _error(409, "NO_SE_PUEDE_CANCELAR", f"Un envío '{e['estado']}' no se cancela; se devuelve")
    for x in [e, *hijos]:
        x["estado"] = "cancelado"
        E["eventos"][x["id"]].append({"id": str(uuid.uuid4()), "tipo_evento": "cancelado", "notas": None, "fecha_hora": _iso(_ahora())})
    for p in E["pagos"].values():
        if p["envio_id"] == eid:
            p["_solicitud"] = {"motivo": "cancelado", "detalle": "cancelado antes de salir", "solicitado_en": _iso(_ahora())}
    return e


@app.patch("/api/v1/envios/{eid}/reprogramar")
async def reprogramar(eid: str, request: Request):
    e = E["envios"].get(eid)
    b = await request.json()
    if not e:
        return JSONResponse(status_code=404, content={"detail": "Envío no encontrado"})
    if e["envio_padre_id"]:
        return _error(409, "PARTE_DE_PEDIDO", "Se reprograma el pedido completo", envio_padre_id=e["envio_padre_id"])
    if e["estado"] != "programado":
        return _error(409, "NO_ESTA_PROGRAMADO", "Solo se reprograma un envío programado")
    fp = _fecha(b.get("fecha_programada"))
    if fp is None or fp < _ahora() + timedelta(minutes=1):
        return _error(422, "FECHA_PROGRAMADA_PASADA", "La fecha programada debe ser futura")
    for x in [e, *[h for h in E["envios"].values() if h["envio_padre_id"] == eid]]:
        x["fecha_programada"] = _iso(fp)
    E["eventos"][eid].append({"id": str(uuid.uuid4()), "tipo_evento": "reprogramado", "notas": b.get("motivo"), "fecha_hora": _iso(_ahora())})
    return e


@app.post("/api/v1/envios/{eid}/reintentar-asignacion")
def reintentar(eid: str):
    e = E["envios"].get(eid)
    if e and not e["partes_total"]:
        _asignar(e)
    return {"envio_id": eid, "codigo_envio": e["codigo_envio"] if e else "", "estado_asignacion": "asignada", "detalle": None, "nota": ""}


# ---------- cobros ----------
def _pagos_de(u, cliente_id=None):
    lista = list(E["pagos"].values())
    if u["rol"] == C:
        lista = [p for p in lista if p["cliente_id"] == u["cliente_id"]]
    elif cliente_id:
        lista = [p for p in lista if p["cliente_id"] == cliente_id]
    return lista


@app.get("/api/v1/pagos")
@app.get("/api/v1/pagos/")
def pagos(request: Request, estado: str | None = None, cliente_id: str | None = None, envio_id: str | None = None):
    lista = _pagos_de(request.state.u, cliente_id)
    if estado:
        lista = [p for p in lista if p["estado"] == estado]
    if envio_id:
        lista = [p for p in lista if p["envio_id"] == envio_id]
    return [_publico(p) for p in lista]


@app.get("/api/v1/pagos/por-reembolsar")
def por_reembolsar():
    return [{**_publico(p), **p["_solicitud"]} for p in E["pagos"].values() if p["_solicitud"] and p["estado"] == "confirmado"]


@app.get("/api/v1/pagos/envio/{eid}")
def pago_envio(eid: str, request: Request):
    p = next((p for p in _pagos_de(request.state.u) if p["envio_id"] == eid), None)
    return _publico(p) if p else _error(404, "PAGO_NO_ENCONTRADO", "Pago no encontrado")


@app.post("/api/v1/pagos/{pid}/reembolsar")
def reembolsar(pid: str):
    p = E["pagos"].get(pid)
    if not p:
        return _error(404, "PAGO_NO_ENCONTRADO", "Pago no encontrado")
    if p["estado"] == "reembolsado":
        return _error(409, "PAGO_YA_REEMBOLSADO", "Este pago ya fue reembolsado")
    if not p["_solicitud"]:
        return _error(409, "PEDIDO_SIN_DEVOLUCION", "El pedido no fue cancelado ni devuelto por completo")
    p["estado"] = "reembolsado"
    p["reembolsado_en"] = _iso(_ahora())
    for f in E["facturas"].values():
        if f["pago_id"] == pid:
            f["estado"] = "anulada"
            f["anulada_en"] = _iso(_ahora())
    return _publico(p)


@app.get("/api/v1/facturas-pedido")
@app.get("/api/v1/facturas-pedido/")
def facturas_pedido(request: Request, estado: str | None = None, cliente_id: str | None = None):
    u = request.state.u
    lista = list(E["facturas"].values())
    if u["rol"] == C:
        lista = [f for f in lista if f["cliente_id"] == u["cliente_id"]]
    elif cliente_id:
        lista = [f for f in lista if f["cliente_id"] == cliente_id]
    if estado:
        lista = [f for f in lista if f["estado"] == estado]
    return lista


@app.get("/api/v1/facturas-pedido/envio/{eid}")
def factura_envio(eid: str, request: Request):
    f = next((f for f in E["facturas"].values() if f["envio_id"] == eid), None)
    if not f or (request.state.u["rol"] == C and f["cliente_id"] != request.state.u["cliente_id"]):
        return _error(404, "FACTURA_NO_ENCONTRADA", "Factura no encontrada")
    return f


@app.get("/api/v1/cotizaciones")
@app.get("/api/v1/cotizaciones/")
def cotizaciones(request: Request):
    u = request.state.u
    return [c for c in E["cotizaciones"] if u["rol"] != C or c["cliente_id"] == u["cliente_id"]]


# ---------- analítica ----------
def _mes(iso):
    return _fecha(iso).astimezone(BOGOTA).strftime("%Y-%m")


def _ingresos(clave):
    filas = {}
    for p in E["pagos"].values():
        if p["confirmado_en"]:
            f = filas.setdefault(clave(p["confirmado_en"]), {"pedidos_cobrados": 0, "bruto": 0.0, "pedidos_reembolsados": 0, "reembolsos": 0.0})
            f["pedidos_cobrados"] += 1
            f["bruto"] += float(p["monto_cop"])
        if p["reembolsado_en"]:
            f = filas.setdefault(clave(p["reembolsado_en"]), {"pedidos_cobrados": 0, "bruto": 0.0, "pedidos_reembolsados": 0, "reembolsos": 0.0})
            f["pedidos_reembolsados"] += 1
            f["reembolsos"] += float(p["monto_cop"])
    return [
        {"periodo": k, "pedidos_cobrados": v["pedidos_cobrados"], "bruto_cop": _dec(v["bruto"]), "pedidos_reembolsados": v["pedidos_reembolsados"],
         "reembolsos_cop": _dec(v["reembolsos"]), "neto_cop": _dec(v["bruto"] - v["reembolsos"]),
         "ticket_promedio_cop": _dec(v["bruto"] / v["pedidos_cobrados"]) if v["pedidos_cobrados"] else None}
        for k, v in sorted(filas.items())
    ]


@app.get("/api/v1/dashboard/ingresos/mensual")
def ingresos_mensual(anio: int | None = None):
    return [f for f in _ingresos(_mes) if not anio or f["periodo"].startswith(str(anio))]


@app.get("/api/v1/dashboard/ingresos/anual")
def ingresos_anual():
    return _ingresos(lambda iso: _mes(iso)[:4])


@app.get("/api/v1/dashboard/ingresos/pedidos")
def ingresos_pedidos(mes: str | None = None, estado: str | None = None):
    filas = []
    for p in E["pagos"].values():
        if mes and _mes(p["confirmado_en"]) != mes:
            continue
        if estado and p["estado"] != estado:
            continue
        f = next((f for f in E["facturas"].values() if f["pago_id"] == p["id"]), None)
        filas.append({"pago_id": p["id"], "envio_id": p["envio_id"], "codigo_envio": p["codigo_envio"], "cliente_id": p["cliente_id"],
                      "monto_cop": p["monto_cop"], "estado_pago": p["estado"], "factura_numero": f and f["numero"],
                      "factura_estado": f and f["estado"], "confirmado_en": p["confirmado_en"], "reembolsado_en": p["reembolsado_en"]})
    return filas


@app.get("/api/v1/dashboard/resumen")
def resumen():
    mes = _mes(_iso(_ahora()))
    neto_mes = sum(float(f["neto_cop"]) for f in _ingresos(_mes) if f["periodo"] == mes)
    neto_anio = sum(float(f["neto_cop"]) for f in _ingresos(_mes) if f["periodo"][:4] == mes[:4])
    envios = list(E["envios"].values())
    return {"total_vehiculos": 3, "vehiculos_en_uso": 1, "flota_disponible": 2, "total_conductores": 3,
            "total_envios_historico": len(envios), "envios_en_transito": 0, "envios_entregados_historico": 0,
            "envios_con_incidencia_historico": 0, "envios_internacionales_retenidos": 0, "tasa_cumplimiento_sla_global_pct": None,
            "facturacion_periodo_actual": "0.00", "programas_mantenimiento_vencidos": 0, "ultima_actualizacion_etl": _iso(_ahora()),
            "ingresos_mes_actual_cop": _dec(neto_mes), "ingresos_anio_actual_cop": _dec(neto_anio)}


@app.post("/api/v1/etl/ejecutar")
def etl():
    return {"ok": True, "detalles": {}}


@app.get("/api/v1/estado")
def estado():
    return {"estado_general": "ok", "servicios": {s: {"estado": "ok", "ms": 3} for s in
            ["fleet", "shipment", "routing", "tracking", "maintenance", "customs", "notification", "billing", "analytics"]}}


# ---------- Flota: ubicación base de los vehículos ----------
def _crear_vehiculo(placa, ciudad, extra=None, tipo="camion", capacidad=5000.0):
    u = next((x for x in E["ubicaciones"].values() if x["codigo"] == ciudad), None) if ciudad else None
    vid = str(uuid.uuid4())
    E["vehiculos"][vid] = {
        "id": vid, "placa": placa, "tipo": tipo, "capacidad_kg": _dec(capacidad), "capacidad_m3": None, "anio": None,
        "vencimiento_seguro": None, "estado": "active", "capacidad_refrigeracion": False, "certificado_hazmat": False,
        "capacidad_tanque_l": None, "consumo_km_por_litro": None, "tipo_combustible": None,
        "latitud": u["latitud"] if u else None, "longitud": u["longitud"] if u else None, "codigo_pais": "CO" if u else None,
        "ubicacion_id": u["id"] if u else None, "ubicacion_nombre": u["nombre"] if u else None,
        "ubicacion_actualizada_en": _iso(_ahora()) if u else None, "ubicacion_fuente": "registro_gestor" if u else None,
        "ubicacion_confiable": bool(u), "peso_reservado_kg": "0", "volumen_reservado_m3": "0", **(extra or {}),
    }
    return E["vehiculos"][vid]


@app.get("/api/v1/vehiculos")
@app.get("/api/v1/vehiculos/")
def vehiculos():
    return [_publico(v) for v in E["vehiculos"].values()]


@app.get("/api/v1/vehiculos/{vid}")
def vehiculo(vid: str):
    v = E["vehiculos"].get(vid)
    return _publico(v) if v else JSONResponse(status_code=404, content={"detail": "Vehículo no encontrado"})


@app.post("/api/v1/vehiculos")
@app.post("/api/v1/vehiculos/")
async def crear_vehiculo(request: Request):
    b = await request.json()
    faltan = [c for c in ("ubicacion_id", "ubicacion_nombre", "latitud", "longitud", "codigo_pais") if b.get(c) in (None, "")]
    if faltan:
        return JSONResponse(status_code=422, content={"detail": [{"loc": ["body", c], "msg": "Field required", "type": "missing"} for c in faltan]})
    u = E["ubicaciones"].get(b["ubicacion_id"])
    if not u or abs(u["latitud"] - float(b["latitud"])) > 1e-9 or abs(u["longitud"] - float(b["longitud"])) > 1e-9:
        return JSONResponse(status_code=422, content={"detail": [{"loc": ["body", "ubicacion_id"], "msg": "Value error, La ubicación no coincide con la lista de ubicaciones guardadas"}]})
    placa = str(b.get("placa", "")).strip().upper()
    if any(v["placa"] == placa for v in E["vehiculos"].values()):
        return JSONResponse(status_code=409, content={"detail": "Ya existe un vehículo con esa placa"})
    v = _crear_vehiculo(placa, u["codigo"], tipo=b.get("tipo") or "camion", capacidad=float(b.get("capacidad_kg") or 1))
    E["ultimo_alta_vehiculo"] = b
    return JSONResponse(status_code=201, content=_publico(v))


@app.put("/api/v1/vehiculos/{vid}/ubicacion")
async def fijar_ubicacion(vid: str, request: Request):
    v = E["vehiculos"].get(vid)
    if not v:
        return JSONResponse(status_code=404, content={"detail": "Vehículo no encontrado"})
    b = await request.json()
    if b.get("fuente", "registro_gestor") == "registro_gestor" and v.get("_en_viaje"):
        return _error(409, "VEHICULO_EN_VIAJE", "El vehículo está en un viaje: su posición la informa el seguimiento, no se puede fijar a mano")
    v.update({"latitud": float(b["latitud"]), "longitud": float(b["longitud"]), "codigo_pais": b.get("codigo_pais"),
              "ubicacion_id": b.get("ubicacion_id"), "ubicacion_nombre": b.get("nombre"), "ubicacion_actualizada_en": _iso(_ahora()),
              "ubicacion_fuente": b.get("fuente", "registro_gestor"), "ubicacion_confiable": True})
    E["ultima_ubicacion_fijada"] = b
    return {"aplicada": True, "motivo": None, "vehiculo": _publico(v)}


@app.get("/api/v1/conductores")
@app.get("/api/v1/conductores/")
def conductores():
    return []


# ---------- Seguimiento del cliente (escenarios controlados por /__mock/seguimiento) ----------
def _ub(codigo):
    return next(x for x in E["ubicaciones"].values() if x["codigo"] == codigo)


def _linea(o, d, n=21):
    return [[o["latitud"] + (d["latitud"] - o["latitud"]) * i / (n - 1), o["longitud"] + (d["longitud"] - o["longitud"]) * i / (n - 1)] for i in range(n)]


@app.post("/__mock/envio_cliente")
def _envio_cliente(estado: str = "en_transito", escenario: str = "en_curso", ajeno: bool = False, dividido: bool = False):
    """Crea un envío ya asignado (Montería -> Cartagena) del cliente de prueba (o de otro cliente si ajeno)."""
    clientes = list(E["clientes"].values())
    cliente = clientes[1] if ajeno else clientes[0]
    E["seq_envio"] += 1
    o, d = _ub("CO-MTR"), _ub("CO-CTG")
    x = {"cliente": cliente, "o": o, "d": d, "fp": None, "km": 297.0}
    e = _nuevo_envio(x, {}, 1200, f"ENV-{E['seq_envio']:08d}")
    e.update({"estado": estado, "vehiculo_id": "veh-goq", "placa_vehiculo": "GOQ998", "tipo_vehiculo": "camion",
              "conductor_nombre": "Andrés Pérez", "monto_cop": "850000.00", "hora_estimada_llegada": _iso(_ahora() + timedelta(hours=3))})
    if dividido:
        e["partes_total"], e["partes_entregadas"] = 2, 0
        for n in (1, 2):
            pte = _nuevo_envio(x, {}, 600, f"{e['codigo_envio']}-P{n}", e["id"], n)
            pte.update({"estado": estado, "placa_vehiculo": f"PRT00{n}", "conductor_nombre": "Otro Conductor"})
            E["seg"][pte["id"]] = {"escenario": escenario, "paso": 0}
    E["seg"][e["id"]] = {"escenario": "dividido" if dividido else escenario, "paso": 0}
    return {"id": e["id"], "codigo_envio": e["codigo_envio"]}


@app.post("/__mock/seguimiento")
def _seguimiento_ctl(envio: str | None = None, escenario: str | None = None, fallos: int | None = None):
    if envio and escenario:
        E["seg"].setdefault(envio, {"paso": 0})["escenario"] = escenario
        if escenario in ("finalizada",):
            E["envios"][envio]["estado"] = "entregado"
        if escenario in ("cancelada",):
            E["envios"][envio]["estado"] = "cancelado"
    if fallos is not None:
        E["seg_fallos"] = fallos
    return {"ok": True}


@app.get("/__mock/seguimiento/consultas")
def _seguimiento_consultas(envio: str | None = None):
    return [{"t": t, "envio": eid} for t, eid in E["seg_consultas"] if not envio or eid == envio]


def _envio_del_cliente(eid, u):
    e = E["envios"].get(eid)
    if not e or e["cliente_id"] != u.get("cliente_id"):
        return None
    return e


def _vista(e, sc, avanzar):
    o, d = _ub("CO-MTR"), _ub("CO-CTG")
    linea = _linea(o, d)
    esc = sc["escenario"]
    if avanzar and esc == "en_curso":
        sc["paso"] = min(sc["paso"] + 1, len(linea) - 2)
    paso = sc["paso"]
    ahora = _ahora()
    base = {"envio_id": e["id"], "codigo_envio": e["codigo_envio"], "estado_envio": e["estado"], "es_pedido_dividido": False,
            "viaja_compartido": esc == "compartido", "trazado_disponible": False, "origen": {"nombre": o["nombre"], "latitud": None, "longitud": None},
            "destino": {"nombre": d["nombre"], "latitud": None, "longitud": None}, "paradas": [], "parada_actual": None, "fase": None,
            "progreso": None, "tiempos": None,
            "posicion": {"disponible": False, "latitud": None, "longitud": None, "velocidad_kmh": None, "actualizada_en": None,
                         "desactualizada": False, "segundos_desde_actualizacion": None, "umbral_segundos": 60}}
    if esc == "dividido":
        return {**base, "estado_viaje": "sin_viaje", "es_pedido_dividido": True, "mensaje": "Su pedido se dividió en partes: siga cada parte por separado."}
    if esc == "sin_viaje":
        return {**base, "estado_viaje": "sin_viaje", "mensaje": "Estamos asignando un vehículo a su envío."}
    if esc == "preparando":
        return {**base, "estado_viaje": "preparando", "mensaje": "Preparando el viaje."}
    con_viaje = {**base, "trazado_disponible": True,
                 "origen": {"nombre": o["nombre"], "latitud": o["latitud"], "longitud": o["longitud"]},
                 "destino": {"nombre": d["nombre"], "latitud": d["latitud"], "longitud": d["longitud"]},
                 "tiempos": {"iniciado_en": _iso(ahora - timedelta(minutes=10)), "hora_estimada_llegada": _iso(ahora + timedelta(minutes=40)),
                             "llegada_en": None, "segundos_restantes": 2400}, "parada_actual": {"en_parada": False, "motivo": None}, "fase": "viaje"}
    total = 297.0
    if esc == "finalizada":
        lat, lon = linea[-1]
        return {**con_viaje, "estado_viaje": "finalizada", "mensaje": "Llegó a su destino.", "fase": None,
                "tiempos": {**con_viaje["tiempos"], "llegada_en": _iso(ahora), "segundos_restantes": None},
                "progreso": {"porcentaje": 100.0, "km_recorridos": total, "km_totales": total, "km_restantes": 0.0},
                "posicion": {**base["posicion"], "disponible": True, "latitud": lat, "longitud": lon, "velocidad_kmh": 0.0,
                             "actualizada_en": _iso(ahora - timedelta(seconds=5)), "segundos_desde_actualizacion": 5}}
    if esc == "cancelada":
        return {**con_viaje, "estado_viaje": "cancelada", "estado_envio": "cancelado", "mensaje": "Envío cancelado.", "fase": None,
                "progreso": {"porcentaje": 10.0, "km_recorridos": 29.7, "km_totales": total, "km_restantes": 267.3}}
    if esc == "reposicion":
        return {**con_viaje, "estado_viaje": "en_curso", "fase": "reposicion", "mensaje": "El vehículo se dirige al punto de recogida.",
                "tiempos": {**con_viaje["tiempos"], "iniciado_en": None},
                "progreso": {"porcentaje": 0.0, "km_recorridos": 0.0, "km_totales": total, "km_restantes": total},
                "posicion": {**base["posicion"], "disponible": True, "latitud": o["latitud"] - 0.2, "longitud": o["longitud"] - 0.1,
                             "velocidad_kmh": 55.0, "actualizada_en": _iso(ahora), "segundos_desde_actualizacion": 0}}
    lat, lon = linea[paso]
    pct = round(paso / (len(linea) - 1) * 100, 1)
    vista = {**con_viaje, "estado_viaje": "pausada" if esc == "pausada" else "en_curso",
             "mensaje": "Detenido por retención en aduana." if esc == "pausada" else "En camino.",
             "progreso": {"porcentaje": pct, "km_recorridos": round(total * pct / 100, 2), "km_totales": total, "km_restantes": round(total * (1 - pct / 100), 2)},
             "posicion": {**base["posicion"], "disponible": True, "latitud": lat, "longitud": lon, "velocidad_kmh": 60.0,
                          "actualizada_en": _iso(ahora), "segundos_desde_actualizacion": 0}}
    if esc == "desactualizada":
        vista["posicion"].update({"desactualizada": True, "segundos_desde_actualizacion": 420, "actualizada_en": _iso(ahora - timedelta(seconds=420))})
    if e["estado"] == "con_incidencia":
        vista["mensaje"] = "Hay una incidencia con su envío; un operador la está atendiendo."
    return vista


@app.get("/api/v1/seguimiento/cliente/envio/{eid}")
def seguimiento_cliente(eid: str, request: Request):
    E["seg_consultas"].append((_iso(_ahora()), eid))
    if E["seg_fallos"] > 0:
        E["seg_fallos"] -= 1
        return _error(503, "SEGUIMIENTO_NO_DISPONIBLE", "No se pudo verificar el envío en este momento; intente de nuevo.")
    e = _envio_del_cliente(eid, request.state.u)
    if not e:
        return _error(404, "ENVIO_NO_ENCONTRADO", "Envío no encontrado")
    sc = E["seg"].setdefault(eid, {"escenario": "sin_viaje", "paso": 0})
    return _vista(e, sc, True)


@app.get("/api/v1/seguimiento/cliente/envio/{eid}/trazado")
def trazado_cliente(eid: str, request: Request):
    e = _envio_del_cliente(eid, request.state.u)
    if not e:
        return _error(404, "ENVIO_NO_ENCONTRADO", "Envío no encontrado")
    esc = E["seg"].get(eid, {}).get("escenario", "sin_viaje")
    if esc in ("sin_viaje", "dividido"):
        return _error(404, "SIN_VIAJE", "El envío aún no tiene un viaje.")
    if esc == "preparando":
        return _error(409, "VIAJE_EN_PREPARACION", "El viaje todavía se está preparando; intente en unos segundos.")
    o, d = _ub("CO-MTR"), _ub("CO-CTG")
    return {"envio_id": eid, "codigo_envio": e["codigo_envio"], "distancia_km": 297.0,
            "origen": {"nombre": o["nombre"], "latitud": o["latitud"], "longitud": o["longitud"]},
            "destino": {"nombre": d["nombre"], "latitud": d["latitud"], "longitud": d["longitud"]},
            "puntos": _linea(o, d), "paradas": []}


@app.get("/api/v1/seguimiento/cliente/envio/{eid}/recorrido")
def recorrido_cliente(eid: str, request: Request, limite: int = 500):
    e = _envio_del_cliente(eid, request.state.u)
    if not e:
        return _error(404, "ENVIO_NO_ENCONTRADO", "Envío no encontrado")
    sc = E["seg"].get(eid, {"escenario": "sin_viaje", "paso": 0})
    if sc["escenario"] in ("sin_viaje", "preparando", "reposicion", "dividido"):
        return []
    linea = _linea(_ub("CO-MTR"), _ub("CO-CTG"))
    hasta = len(linea) if sc["escenario"] == "finalizada" else sc["paso"] + 1
    t0 = _ahora() - timedelta(minutes=10)
    return [{"tiempo": _iso(t0 + timedelta(seconds=10 * i)), "latitud": p[0], "longitud": p[1]} for i, p in enumerate(linea[:hasta])][-limite:]


# Mapa del PERSONAL para el mismo viaje (para comprobar que no cambió): trae placa, conductor y combustible
@app.get("/api/v1/seguimiento/envio/{eid}")
def seguimiento_personal(eid: str):
    e = E["envios"].get(eid)
    sc = E["seg"].get(eid)
    if not e or not sc or sc["escenario"] not in ("en_curso", "desactualizada", "pausada"):
        return _error(404, "SIN_VIAJE", "El envío aún no tiene viaje")
    v = _vista(e, sc, False)
    return {"envio_id": eid, "codigo_envio": e["codigo_envio"], "codigo_ruta": "RUT-00000007", "estado_viaje": v["estado_viaje"],
            "mensaje": v["mensaje"], "factor_tiempo": 10, "vehiculo": {"id": "veh-goq", "placa": "GOQ998", "conductor_id": None, "conductor_nombre": "Andrés Pérez"},
            "origen": v["origen"], "destino": v["destino"],
            "posicion": {k: v["posicion"][k] for k in ("latitud", "longitud", "velocidad_kmh", "actualizada_en")},
            "progreso": v["progreso"], "tiempos": v["tiempos"],
            "combustible": {"nivel_pct": 72.0, "litros": 216.0, "capacidad_l": 300.0, "autonomia_km": 640.0, "recargas": 0, "litros_recargados": 0, "estimado": False},
            "parada_actual": {"en_parada": False, "motivo": None, "hasta": None}, "siguiente_parada": None, "paradas": []}


@app.get("/api/v1/seguimiento/envio/{eid}/trazado")
def trazado_personal(eid: str):
    if eid not in E["seg"]:
        return _error(404, "SIN_VIAJE", "El envío aún no tiene viaje")
    o, d = _ub("CO-MTR"), _ub("CO-CTG")
    return {"envio_id": eid, "codigo_envio": E["envios"][eid]["codigo_envio"], "codigo_ruta": "RUT-00000007", "distancia_km": 297.0,
            "origen": {"nombre": o["nombre"], "latitud": o["latitud"], "longitud": o["longitud"]},
            "destino": {"nombre": d["nombre"], "latitud": d["latitud"], "longitud": d["longitud"]}, "puntos": _linea(o, d), "paradas": []}


# Lo demás que la interfaz pide de pasada (flota, mapa, aduanas…): listas vacías o "sin viaje"
@app.api_route("/api/v1/{resto:path}", methods=["GET", "POST", "PATCH", "PUT"])
def resto(resto: str, request: Request):
    if resto.startswith("seguimiento/envio") or resto.startswith("simulaciones/envio") or resto.startswith("reservas/envio") \
            or resto.startswith("declaraciones/") or resto.startswith("seguimiento/vehiculo"):
        return _error(404, "SIN_VIAJE", "El envío aún no tiene viaje")
    if request.method == "GET":
        return []
    return JSONResponse(status_code=404, content={"detail": "No existe en el gateway simulado"})


# CORS por fuera de todo (también en los 401/403/503 que responde la puerta), como el gateway real
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["X-Request-ID"])

reiniciar()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="warning")
