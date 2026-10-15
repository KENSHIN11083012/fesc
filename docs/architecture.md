# Arquitectura

## Contexto

Antes de otorgar una tarifa subsidiada o un subsidio, una caja de compensación debe verificar que la persona no tenga
afiliación vigente en otra caja. Hoy eso se hace con archivos mensuales o integraciones punto a punto que crecen con cada
caja nueva. Caja Link es un servicio de interoperabilidad que responde esa pregunta en línea y por lote, consultando a las
cajas por sus propias interfaces (REST, SOAP y archivo plano), sin compartir bases de datos, sin exponer datos personales
(Ley 1581: finalidad, dato mínimo, trazabilidad) y sin dar un falso "no afiliado" cuando una caja no responde.

## Componentes

Servicios de `docker-compose.yml`:

| Servicio | Rol |
|---|---|
| `caja-link` | El hub de interoperabilidad (Node 24 + Express 5 + TypeScript), puerto 8083 |
| `caja-norte` | Caja simulada REST JSON (`X-Api-Key`), puerto 9001 |
| `caja-oriente` | Caja simulada SOAP 1.1, puerto 9002 |
| `caja-sur` | Cuarta caja simulada REST v2 (Bearer), perfil `caja-sur`, puerto 9004 |
| `tests` | Pruebas automatizadas del equipo contra el servicio en funcionamiento, perfil `test` |
| `k6` | Prueba de carga del lote, perfil `load` |

Caja Centro no tiene servicio: su archivo diario de `caja-centro/` se monta en `caja-link` en modo solo lectura.

Capas internas de `caja-link` (arquitectura hexagonal, ver ADR 001):

```text
http/            Express: autenticación por token, rutas v1/v2/lote/auditoría, presenters (lista blanca)
  │
application/     Casos de uso: CheckAffiliation, SubmitBatch, BatchProcessor, GetBatchStatus, GetAuditLog
  │              Puertos: CajaGateway, AuditRepository, JobRepository, Clock, IdGenerator
domain/          Reglas puras: normalizeDocument, isActiveOn, decideVerdict, isPurpose, maskDocument
  ▲
infrastructure/  Adaptadores: NorteRest, OrienteSoap, CentroFile, SurRest + ResilientGateway (decorator)
                 + gateway-factory (type → adaptador), configuración YAML, SQLite, reloj, ULID
main.ts          Composition root: crea las implementaciones y las inyecta
```

## Flujo de consulta

1. La caja consumidora llama `GET /api/v1/affiliations/{document}?purpose=...` con su token Bearer.
2. El middleware de autenticación identifica la caja dueña del token (comparación en tiempo constante); sin token válido → 401.
3. La ruta valida la finalidad; si falta o no es válida → 400.
4. `CheckAffiliation` normaliza el documento (quita puntos, espacios, guiones y ceros a la izquierda) y excluye a la caja
   que consulta de la lista de cajas habilitadas.
5. Consulta en paralelo cada caja a través de su adaptador envuelto en `ResilientGateway`: Norte por REST, Oriente por SOAP
   (documento de 12 dígitos), Centro desde el archivo en memoria (`source: FILE`, `asOf` = fecha de corte) y Sur si está habilitada.
6. Cada adaptador traduce la respuesta al modelo interno y descarta los datos personales.
7. `decideVerdict` aplica la regla de vigencia (fecha fin vacía o posterior o igual a hoy) y decide el resultado.
8. Se registra la auditoría con el documento enmascarado y el presenter v1 o v2 arma la respuesta campo por campo.

En el lote, `POST /api/v1/batch-checks` responde 202 con `jobId`; `BatchProcessor` reutiliza el mismo caso de uso para cada
documento con 32 trabajadores concurrentes, y `GET /api/v1/batch-checks/{jobId}` entrega el estado y los resultados.

## Manejo de fallas

- **Caja caída o con error:** el adaptador rechaza, `ResilientGateway` reintenta una vez si queda tiempo y, si sigue fallando,
  la caja queda en `unavailable`. Sin coincidencias en las demás, el resultado es `INDETERMINADO`; nunca `NO_AFILIADO`.
- **Caja lenta:** cada caja tiene un presupuesto de 3 s en línea (`AbortController`); como se consultan en paralelo, la
  respuesta completa llega antes de 5 s aunque Norte tarde 8 s.
- **Archivo de Centro ausente o dañado:** si ya había un archivo cargado se sigue usando; si nunca hubo, Centro aparece en
  `unavailable`. El servicio revisa cada 30 s si llegó un archivo más reciente.
- **Configuración incompleta:** si una caja habilitada no tiene su URL o credenciales, el servicio no arranca y lo indica.
- **Reinicio del servicio:** auditoría, lotes e idempotencia están en SQLite (volumen `caja-link-data`); los lotes sin terminar
  se retoman al iniciar.
- **Errores inesperados:** el manejador de errores responde 500 con un mensaje genérico, sin exponer detalles internos.

## Alternativas descartadas

- **Integraciones punto a punto entre cajas (federado puro):** se descartó porque con 5 cajas son 10 integraciones distintas,
  la lógica de vigencia y de dato mínimo se repetiría en cada caja y la auditoría quedaría dispersa.
- **Base de datos central con réplica de las afiliaciones:** se descartó porque obliga a copiar datos personales de todas las
  cajas (contrario al dato mínimo), crea un nuevo punto de acoplamiento como el del legacy y la información quedaría desactualizada.
- **Cola de mensajes externa para el lote (Redis o RabbitMQ):** se descartó por ahora porque un solo proceso con concurrencia
  controlada procesa 10 000 documentos en unos 14 s; agregarla suma operación sin beneficio para el volumen actual.
- **Caché de respuestas de las cajas como respaldo cuando fallan:** se descartó porque podría afirmar afiliaciones ya terminadas;
  se prefirió responder `INDETERMINADO` (principio de veracidad).
