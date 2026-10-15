# ADR 005: lote asíncrono, idempotente y persistido en SQLite

- Estado: aceptada
- Fecha: 2026-10-14

## Contexto

El cruce por lote recibe archivos de 10 000 documentos o más y debe terminar en 5 minutos o menos. Una petición HTTP no
puede quedarse abierta todo ese tiempo, y si el cliente reintenta por un corte de red no debe procesarse el lote dos veces.
Además, la auditoría y el estado de los lotes no deberían perderse al reiniciar el servicio (por ejemplo, al activar Caja Sur).

## Decisión

- `POST /api/v1/batch-checks` valida el CSV, crea el trabajo y responde **202** con `jobId` de inmediato; el procesamiento
  ocurre en segundo plano con una cola (un lote a la vez) y un grupo de 32 trabajadores concurrentes.
- **Idempotencia:** la pareja (caja que envía, `Idempotency-Key`) es única en la base; repetir el envío devuelve el mismo `jobId`.
- Los documentos repetidos dentro de un lote se consultan una sola vez.
- **SQLite nativo de Node** (`node:sqlite`) guarda auditoría y lotes en un volumen de Docker; al iniciar, el servicio retoma
  los lotes que quedaron sin terminar.
- Solo la caja que envió el lote (o administración) puede ver su estado y resultados.

## Alternativas

- **Procesamiento síncrono en la misma petición:** más simple, pero la conexión quedaría abierta minutos y cualquier timeout
  de un proxy perdería el trabajo.
- **Cola externa (Redis, RabbitMQ) con workers separados:** escala horizontalmente, pero suma servicios a operar; para el volumen
  del reto un solo proceso termina 10 000 documentos en unos 14 s.
- **Estado solo en memoria:** sin dependencias, pero un reinicio pierde auditoría, lotes e idempotencia.
- **PostgreSQL:** robusto para varios nodos, pero otro contenedor y más configuración para un único servicio.

## Consecuencias

- La prueba de carga con k6 procesó 10 000 documentos en 14,1 s y 0 errores, con consultas en línea en paralelo (p95 de 42 ms).
- Reintentar un envío es seguro para el cliente.
- SQLite limita a una sola instancia del servicio escribiendo; para escalar a varias réplicas habría que migrar a PostgreSQL
  y a una cola compartida, cambio que solo afecta a los adaptadores de persistencia gracias a los puertos `AuditRepository`
  y `JobRepository`.
