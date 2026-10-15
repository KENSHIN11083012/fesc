# Caja Link — Erick Santiago Ocampo Marciales

Servicio de interoperabilidad entre cajas de compensación familiar · FESC Legacy Challenge 2026 · Nivel Profesional.

## Descripción

Caja Link permite que varias cajas de compensación familiar validen si una persona tiene una afiliación vigente en **otra**
caja antes de otorgar una tarifa subsidiada o un subsidio monetario. Lo hace sin compartir bases de datos: consulta a cada caja
por su propia interfaz (REST JSON, SOAP/XML o archivo plano diario), aplica las mismas reglas de vigencia para todas y responde
solo lo indispensable (Ley 1581 de 2012: finalidad obligatoria, dato mínimo y auditoría). Si una caja no responde, nunca contesta
"no afiliado": responde `INDETERMINADO` e indica qué caja faltó. Ofrece consulta en línea (v1 y v2), cruce por lote de miles de
documentos y una bitácora de auditoría para administración. Está pensado para los equipos de afiliaciones y subsidios de cada caja.

## Integrantes

- Erick Santiago Ocampo Marciales — análisis, arquitectura, desarrollo, pruebas y documentación
- Equipo de una sola persona (participación individual)

## Requisitos

- Docker Engine 24 o superior (o Docker Desktop) con Docker Compose v2.
- Linux, macOS o Windows 11 con WSL 2.
- Puertos libres en el equipo: 8083 (Caja Link), 9001, 9002 y 9004 (cajas simuladas).
- Opcional, solo para desarrollo sin Docker: Node.js 22.13 o superior (se usó Node 24) y Python 3 para el validador del kit.

## Instalación y ejecución

Desde una copia limpia del repositorio:

```bash
git clone https://github.com/KENSHIN11083012/fesc.git
cd fesc
cp .env.example .env
docker compose up -d --build
curl http://localhost:8083/health
```

El último comando debe responder `{"status":"UP","cajas":["NORTE","ORIENTE","CENTRO"]}`. Para incorporar la cuarta caja
(Caja Sur) se cambia `CAJA_SUR_ENABLED=true` en `.env` y se ejecuta:

```bash
docker compose --profile caja-sur up -d --force-recreate
```

Para volver al estado inicial: `./reset.sh`. Para revisar el contrato con el validador del kit: `./validator check --lote`.

## Configuración

Todas las variables están en `.env.example` (copiar a `.env`, que no se versiona). Los valores de ejemplo de esta tabla son
ilustrativos: en un ambiente real cada secreto debe ser largo y aleatorio.

| Variable | Para qué sirve | Valor de ejemplo |
|---|---|---|
| `NORTE_TOKEN` | Token con el que Caja Norte se autentica ante Caja Link cuando consulta | `<token-aleatorio-de-norte>` |
| `ORIENTE_TOKEN` | Token con el que Caja Oriente se autentica ante Caja Link | `<token-aleatorio-de-oriente>` |
| `CENTRO_TOKEN` | Token con el que Caja Centro se autentica ante Caja Link | `<token-aleatorio-de-centro>` |
| `SUR_TOKEN` | Token con el que Caja Sur se autentica ante Caja Link | `<token-aleatorio-de-sur>` |
| `ADMIN_TOKEN` | Token de administración; es el único que puede leer la auditoría | `<token-aleatorio-de-administracion>` |
| `CAJA_NORTE_URL` | URL base del servicio REST de Caja Norte | `http://caja-norte:9001` |
| `CAJA_NORTE_API_KEY` | Llave que Caja Link envía en `X-Api-Key` a Caja Norte | `<llave-entregada-por-norte>` |
| `CAJA_ORIENTE_URL` | URL del servicio SOAP de Caja Oriente | `http://caja-oriente:9002/ws/AfiliacionService` |
| `CAJA_ORIENTE_USER` | Usuario que Caja Link envía en el Header SOAP de Oriente | `<usuario-entregado-por-oriente>` |
| `CAJA_ORIENTE_PASSWORD` | Clave que Caja Link envía en el Header SOAP de Oriente | `<clave-entregada-por-oriente>` |
| `CAJA_CENTRO_DIR` | Carpeta (dentro del contenedor) donde está el archivo diario de Caja Centro | `/data/caja-centro` |
| `CAJA_SUR_URL` | URL base del servicio REST v2 de Caja Sur | `http://caja-sur:9004` |
| `CAJA_SUR_TOKEN` | Token Bearer que Caja Link envía a Caja Sur | `<token-entregado-por-sur>` |
| `CAJA_SUR_ENABLED` | Activa la cuarta caja sin tocar el código (`true` / `false`) | `false` |
| `CAJA_NORTE_PORT` | Puerto publicado en el equipo para Caja Norte simulada | `9001` |
| `CAJA_ORIENTE_PORT` | Puerto publicado en el equipo para Caja Oriente simulada | `9002` |
| `CAJA_SUR_PORT` | Puerto publicado en el equipo para Caja Sur simulada | `9004` |

Variables opcionales (tienen valor por defecto en `config/cajas.yaml`): `ONLINE_TIMEOUT_MS` (tiempo máximo por caja en la
consulta en línea, `3000`) y `BATCH_CONCURRENCY` (documentos simultáneos en el lote, `32`). Las cajas se declaran en
`config/cajas.yaml`: cada una tiene `name`, `type` (`rest-norte`, `soap-oriente`, `file-centro`, `rest-sur`), `enabled`,
`consumerToken` y `connection`, y sus valores se toman del entorno con `${VARIABLE}`.

## Arquitectura

Caja Link es un **hub central** con **arquitectura hexagonal** (puertos y adaptadores) y principios SOLID. Servicios de
`docker-compose.yml`:

- **caja-link**: el servicio del equipo (Node 24 + Express 5 + TypeScript) en el puerto 8083. Recibe las consultas de las cajas,
  consulta en paralelo a las demás y guarda auditoría y lotes en SQLite (volumen `caja-link-data`). Lee el archivo de Caja
  Centro desde `./caja-centro` (solo lectura) y la configuración desde `./config`.
- **caja-norte**: caja simulada REST JSON (puerto 9001), consultada con `X-Api-Key`.
- **caja-oriente**: caja simulada SOAP 1.1 (puerto 9002), consultada con credenciales en el Header SOAP.
- **caja-sur**: cuarta caja simulada REST v2 (puerto 9004, perfil `caja-sur`), consultada con Bearer cuando `CAJA_SUR_ENABLED=true`.
- **tests**: pruebas automatizadas del equipo (perfil `test`); prueban `caja-link` en funcionamiento y dejan JUnit en `./test-results/`.
- **k6**: prueba de carga del lote (perfil `load`) con el archivo `data/lote_10000.csv`.

Dentro de `caja-link` el código se organiza en `src/domain` (reglas puras), `src/application` (casos de uso y puertos),
`src/infrastructure` (un adaptador por caja, decorator de resiliencia, fábrica por configuración, SQLite) y `src/http`
(Express); `src/main.ts` conecta todo. Las cajas se comunican con Caja Link por HTTP con token Bearer, y Caja Link con ellas
solo por sus interfaces públicas. Detalle en [docs/architecture.md](docs/architecture.md).

## Uso

Todas las rutas exigen `Authorization: Bearer <token>`. Ejemplos con el token de Caja Oriente (`$ORIENTE_TOKEN`):

**Consulta en línea v1** — `GET /api/v1/affiliations/{document}?purpose=...`

```bash
curl -H "Authorization: Bearer $ORIENTE_TOKEN" \
  "http://localhost:8083/api/v1/affiliations/1.002.329.359?purpose=TARIFA_SUBSIDIADA"
```

```json
{"requestId":"01M4YNN029NWSSZG8N0KAAGX6A","result":"AFILIADO_OTRA_CAJA",
 "matches":[{"caja":"NORTE","validFrom":"2026-06-07","validTo":null,"source":"ONLINE","asOf":"2026-10-14"}],"unavailable":[]}
```

**Consulta en línea v2** — `GET /api/v2/affiliations/{document}?purpose=...` (agrega `affiliateType`)

```bash
curl -H "Authorization: Bearer $ORIENTE_TOKEN" \
  "http://localhost:8083/api/v2/affiliations/1001667616?purpose=SUBSIDIO_MONETARIO"
```

**Enviar lote** — `POST /api/v1/batch-checks` (CSV con columna `document` y encabezado `Idempotency-Key`)

```bash
curl -X POST -H "Authorization: Bearer $NORTE_TOKEN" -H "Content-Type: text/csv" \
  -H "Idempotency-Key: lote-2026-10-14-001" --data-binary @data/lote_10000.csv \
  http://localhost:8083/api/v1/batch-checks
```

Respuesta: `202 {"jobId":"01M4YN3A0QF0X1Z5R6S7T8V9W0"}`. Repetir con la misma `Idempotency-Key` devuelve el mismo `jobId`.

**Estado del lote** — `GET /api/v1/batch-checks/{jobId}`

```bash
curl -H "Authorization: Bearer $NORTE_TOKEN" http://localhost:8083/api/v1/batch-checks/01M4YN3A0QF0X1Z5R6S7T8V9W0
```

Respuesta: `{"jobId":"...","status":"DONE","total":10000,"processed":10000,"results":[{"document":"1088653751","result":"NO_AFILIADO",...}]}`

**Auditoría** — `GET /api/v1/audit?limit=100` (solo `ADMIN_TOKEN`)

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" "http://localhost:8083/api/v1/audit?limit=100"
```

Respuesta: `{"count":2,"entries":[{"timestamp":"...","requestingCaja":"ORIENTE","purpose":"TARIFA_SUBSIDIADA","result":"AFILIADO_OTRA_CAJA","documentMasked":"******9359"}]}`

Resultados posibles: `AFILIADO_OTRA_CAJA`, `NO_AFILIADO` (todas respondieron y ninguna tiene afiliación vigente) e
`INDETERMINADO` (alguna caja no respondió y no hubo coincidencias). Errores: 401 sin token válido, 403 auditoría con token de
caja, 400 sin finalidad válida o documento inválido. Contrato completo en [openapi.yaml](openapi.yaml).

## Pruebas

Las pruebas automatizadas están en `tests/` y usan el ejecutor nativo de Node (`node --test`). Se ejecutan con el servicio arriba:

```bash
docker compose up -d --build
docker compose --profile test run --rm tests
```

Son 38 pruebas que dejan el reporte JUnit en `test-results/junit.xml`:

- **Unitarias** (`tests/unit/`): normalización de documentos, regla de vigencia, veredicto (incluido `INDETERMINADO`),
  enmascaramiento, adaptadores (formato de Oriente, archivo de Centro sin datos personales, CSV), configuración (cuarta caja
  por configuración), el decorator de resiliencia con dobles de prueba y que ningún secreto esté escrito en el código.
- **De integración** (`tests/integration/`): contra el servicio real por HTTP. Autenticación (401/403), finalidad (400),
  dobles afiliaciones, exclusión de la caja consultante, normalización, `source: FILE` de Centro, ausencia de datos
  personales, v1 frente a v2, Caja Norte caída y lenta (usando `/__chaos`), auditoría enmascarada y lote idempotente.

La prueba de carga se ejecuta con `docker compose --profile load run --rm k6` (resultados en [docs/load-test.md](docs/load-test.md)).

## Documentación

- [docs/architecture.md](docs/architecture.md): contexto, componentes, flujo de consulta, manejo de fallas y alternativas.
- [docs/adr/](docs/adr/): decisiones de arquitectura (hub hexagonal, adaptadores por configuración, tolerancia a fallas, dato
  mínimo, lote asíncrono).
- [docs/threat-model.md](docs/threat-model.md): modelo de amenazas con la prueba automatizada que demuestra cada mitigación.
- [docs/load-test.md](docs/load-test.md): prueba de carga del lote con k6.
- [openapi.yaml](openapi.yaml): contrato OpenAPI 3 (v1, v2, lote, estado del lote y auditoría).
- [config/cajas.yaml](config/cajas.yaml): declaración de las cuatro cajas.
- [AI_USAGE.md](AI_USAGE.md): uso de inteligencia artificial en el proyecto.

## Qué resolvimos

- **Cajas heterogéneas:** un adaptador por protocolo traduce REST, SOAP (documentos de 12 dígitos con ceros y fechas
  DD/MM/YYYY) y el archivo plano de Centro a un único modelo interno, sin datos personales.
- **Normalización:** cualquier variante de un documento (puntos, espacios, guiones, ceros a la izquierda) se resuelve igual.
- **Tolerancia a fallas:** consultas en paralelo con presupuesto de 3 s por caja; con Norte lenta (8 s) la respuesta llega en
  unos 3 s, y con una caja caída el resultado es `INDETERMINADO`, nunca un falso `NO_AFILIADO`.
- **Lote:** 10 000 documentos en unos 14 s, idempotente por `Idempotency-Key`, persistido y reanudable.
- **Evolución:** v2 sin cambiar v1 y Caja Sur incorporada solo con `CAJA_SUR_ENABLED=true`, verificada con el mismo
  procedimiento del calificador.
- Con el validador del kit quedan aprobadas las 13 pruebas que evalúa localmente, y los 10 000 resultados del lote coinciden
  con los esperados para los datos sintéticos.

## Limitaciones y pendientes

- SQLite limita el servicio a una sola instancia; para varias réplicas habría que migrar a PostgreSQL y a una cola compartida.
- No hay circuit breaker: una caja caída se sigue intentando en cada consulta (acotado por el presupuesto de tiempo).
- Los tokens son estáticos y se configuran por variables de entorno; en producción convendría mTLS u OAuth 2.0 entre cajas y rotación de secretos.
- No se implementó una interfaz gráfica; el servicio se usa por su API.
- La auditoría no tiene política de retención ni exportación.
