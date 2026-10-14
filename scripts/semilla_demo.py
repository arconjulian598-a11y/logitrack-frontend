"""Datos de DEMOSTRACIÓN para un backend vacío (opcional).

Crea vehículos, conductores, clientes, tarifas, programas de mantenimiento y algunos envíos usando
SOLO rutas públicas del API Gateway (las mismas que usa el frontend). Todos los nombres, documentos
y placas son ficticios. No sustituye a la API: los datos quedan en las bases reales del backend y
el flujo (asignación, viaje simulado, aduanas, facturación) lo ejecuta el propio backend.

Uso:  python scripts/semilla_demo.py            (gateway en http://localhost:8002)
      GATEWAY_URL=http://otro:8002 python scripts/semilla_demo.py
Es idempotente para vehículos y clientes (si ya existen, los reutiliza).
"""
import json
import sys
import urllib.error
import urllib.request

import os

API = os.getenv("GATEWAY_URL", "http://localhost:8002").rstrip("/") + "/api/v1"


def api(metodo, ruta, cuerpo=None):
    req = urllib.request.Request(
        API + ruta, method=metodo,
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


VEHICULOS = [
    dict(placa="GOQ998", tipo="camion", capacidad_kg=3000, capacidad_m3=20, anio=2022, vencimiento_seguro="2027-03-31",
         capacidad_tanque_l=150, consumo_km_por_litro=4.5, tipo_combustible="diesel"),
    dict(placa="TKR451", tipo="tractocamion", capacidad_kg=5000, capacidad_m3=45, anio=2021, vencimiento_seguro="2026-12-15",
         capacidad_tanque_l=400, consumo_km_por_litro=2.8, tipo_combustible="diesel", certificado_hazmat=True),
    dict(placa="FRZ210", tipo="camion", capacidad_kg=2500, capacidad_m3=18, anio=2023, vencimiento_seguro="2027-06-30",
         capacidad_tanque_l=120, consumo_km_por_litro=4.2, tipo_combustible="diesel", capacidad_refrigeracion=True),
    dict(placa="VAN073", tipo="furgoneta", capacidad_kg=900, capacidad_m3=8, anio=2024, vencimiento_seguro="2027-01-20",
         capacidad_tanque_l=70, consumo_km_por_litro=9.5, tipo_combustible="gasolina"),
    dict(placa="VAN118", tipo="furgoneta", capacidad_kg=1100, capacidad_m3=10, anio=2020, vencimiento_seguro="2026-11-05",
         capacidad_tanque_l=75, consumo_km_por_litro=8.8, tipo_combustible="diesel", capacidad_refrigeracion=True),
    dict(placa="CMN602", tipo="camion", capacidad_kg=4000, capacidad_m3=30, anio=2019, vencimiento_seguro="2026-10-30",
         capacidad_tanque_l=180, consumo_km_por_litro=3.9, tipo_combustible="diesel"),
    dict(placa="GNV330", tipo="camion", capacidad_kg=3500, capacidad_m3=24, anio=2022, vencimiento_seguro="2027-08-12",
         capacidad_tanque_l=160, consumo_km_por_litro=4.1, tipo_combustible="gnv"),
    dict(placa="TKR902", tipo="tractocamion", capacidad_kg=5000, capacidad_m3=50, anio=2018, vencimiento_seguro="2026-10-01",
         capacidad_tanque_l=420, consumo_km_por_litro=2.6, tipo_combustible="diesel", estado="fuera_de_servicio"),
]

CONDUCTORES = [
    ("GOQ998", dict(nombre="Francisco Ríos", licencia_numero="LIC-100231", categorias_licencia="C2", anios_experiencia=6, horas_semanales=42)),
    ("TKR451", dict(nombre="Luz Marina Ortega", licencia_numero="LIC-100877", categorias_licencia="C3", anios_experiencia=9, certificacion_hazmat=True, horas_semanales=45)),
    ("FRZ210", dict(nombre="Andrés Cárdenas", licencia_numero="LIC-101442", categorias_licencia="C2,B2", anios_experiencia=4, horas_semanales=38)),
    ("VAN073", dict(nombre="Paola Méndez", licencia_numero="LIC-102019", categorias_licencia="B1", anios_experiencia=2, horas_semanales=40)),
    ("VAN118", dict(nombre="Jhon Fredy Salazar", licencia_numero="LIC-102655", categorias_licencia="C1", anios_experiencia=3, horas_semanales=36)),
    ("CMN602", dict(nombre="Diana Patiño", licencia_numero="LIC-103310", categorias_licencia="C2", anios_experiencia=5, horas_semanales=44)),
    ("GNV330", dict(nombre="Óscar Villamizar", licencia_numero="LIC-103954", categorias_licencia="B2", anios_experiencia=7, horas_semanales=40)),
    (None, dict(nombre="Camilo Ardila", licencia_numero="LIC-104120", categorias_licencia="B1", anios_experiencia=1, horas_semanales=0)),
]

CLIENTES = [
    dict(nombre="Distribuidora del Caribe S.A.S.", tipo_documento="NIT", numero_documento="900123456-7",
         email="logistica@distcaribe.example", telefono="3001234567", direccion="Calle 10 # 5-20, Montería"),
    dict(nombre="Frigoríficos Andinos Ltda.", tipo_documento="NIT", numero_documento="901555210-3",
         email="despachos@frigoandinos.example", telefono="6014445566", direccion="Av. Boyacá 68-12, Bogotá"),
    dict(nombre="Químicos Industriales del Valle", tipo_documento="NIT", numero_documento="890310777-1",
         email="hse@quimvalle.example", telefono="6023339988", direccion="Zona Franca Palmaseca, Palmira"),
    dict(nombre="Textiles Montaña S.A.", tipo_documento="NIT", numero_documento="811022334-9",
         email="exportaciones@textilesmontana.example", telefono="6043217788", direccion="Cra. 50 # 30-15, Medellín"),
    dict(nombre="María Fernanda Gómez", tipo_documento="CC", numero_documento="1032456789",
         email="mfgomez@correo.example", telefono="3157778899"),
]


def main():
    placas = {}
    for v in VEHICULOS:
        s, r = api("POST", "/vehiculos", v)
        if s == 409:
            s, r = api("GET", f"/vehiculos/placa/{v['placa']}")
        placas[v["placa"]] = r["id"]
        print("vehiculo", v["placa"], s)
    for placa, c in CONDUCTORES:
        if placa:
            c = dict(c, vehiculo_id=placas[placa])
        s, r = api("POST", "/conductores", c)
        print("conductor", c["nombre"], s, "" if s < 300 else r)
    clientes = []
    for c in CLIENTES:
        s, r = api("POST", "/clientes", c)
        if s == 409:
            s, lst = api("GET", f"/clientes?q={c['numero_documento']}")
            r = lst[0]
        clientes.append(r)
        print("cliente", c["nombre"], s, r.get("codigo_cliente"))
    tarifas = [("por_km", 1850), ("por_envio", 420000), ("por_km", 2100), ("tarifa_plana", 9500000)]
    for cli, (modelo, valor) in zip(clientes, tarifas):
        s, _ = api("POST", "/tarifas", {"cliente_id": cli["id"], "modelo": modelo, "valor": valor})
        print("tarifa", modelo, s)
    api("POST", "/preferencias/" + clientes[0]["id"], {"idioma": "es", "canal_preferido": "email"})
    for placa, tipo, fecha, km, prio in [
        ("GOQ998", "cambio_aceite", "2026-10-25T13:00:00Z", 45000, "media"),
        ("CMN602", "revision_frenos", "2026-10-16T13:00:00Z", None, "alta"),
        ("VAN118", "revision_tecnomecanica", "2026-10-02T13:00:00Z", None, "alta"),
        ("TKR451", "cambio_llantas", None, 120000, "baja"),
    ]:
        s, _ = api("POST", "/programas", {"vehiculo_id": placas[placa], "tipo": tipo, "fecha_vencimiento": fecha,
                                           "kilometraje_vencimiento": km, "prioridad": prio})
        print("programa", placa, tipo, s)
    s, _ = api("POST", "/intervenciones", {"vehiculo_id": placas["GOQ998"], "tipo": "cambio_aceite", "costo": 380000,
                                           "taller": "Serviteca La 30", "kilometraje_en_servicio": 40210})
    print("intervencion", s)

    cod = [c["codigo_cliente"] for c in clientes]
    envios = [
        dict(codigo_cliente=cod[0], origen_codigo="CO-MTR", destino_codigo="CO-CTG", peso_kg=800, volumen_m3=6),
        dict(codigo_cliente=cod[1], origen_codigo="CO-BOG", destino_codigo="CO-MDE", peso_kg=1800, volumen_m3=12, tipo_carga="refrigerada"),
        dict(codigo_cliente=cod[2], origen_codigo="CO-CLO", destino_codigo="CO-BUN", peso_kg=4200, volumen_m3=30, es_hazmat=True),
        dict(codigo_cliente=cod[3], origen_codigo="CO-MDE", destino_codigo="EC-UIO", peso_kg=2200, volumen_m3=16,
             fecha_limite_sla="2026-10-20T22:00:00Z"),
        dict(codigo_cliente=cod[0], origen_codigo="CO-BAQ", destino_codigo="CO-SMR", peso_kg=650, volumen_m3=5),
        dict(codigo_cliente=cod[4], origen_codigo="CO-BGA", destino_codigo="CO-CUC", peso_kg=300, volumen_m3=2),
        dict(codigo_cliente=cod[3], origen_codigo="CO-CUC", destino_codigo="VE-CCS", peso_kg=2600, volumen_m3=20),
    ]
    for e in envios:
        s, r = api("POST", "/envios", e)
        print("envio", e["origen_codigo"], "->", e["destino_codigo"], s, r.get("codigo_envio") if s == 201 else r)


if __name__ == "__main__":
    sys.exit(main())
