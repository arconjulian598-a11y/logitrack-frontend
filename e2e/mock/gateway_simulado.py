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
    _p("GET", r"(vehiculos|conductores|reservas|rutas|rutas-maestras|seguimiento|simulaciones|telemetria|programas|intervenciones)(/.*)?", O, G, A),
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
    if resto.rstrip("/") == "/auth/login":
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
def ubicaciones(q: str | None = None, pais: str | None = None):
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
