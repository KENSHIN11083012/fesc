# Prueba de carga del lote

herramienta: k6
documentos: 10000
duracion_segundos: 14.1
errores: 0

## Cómo se ejecutó

```bash
docker compose up -d --build
docker compose --profile load run --rm k6
```

El script está en `loadtest/batch-10000.js` y corre en el contenedor oficial `grafana/k6:0.54.0`, dentro de la red de
docker compose (habla con `caja-link` por su nombre de servicio). Se ejecutaron dos escenarios simultáneos:

| Escenario | Qué hace | Resultado |
|---|---|---|
| `lote` | Envía `data/lote_10000.csv` a `POST /api/v1/batch-checks` y consulta el estado cada segundo hasta `DONE` | 10 000 resultados en **14,1 s** (límite: 300 s) |
| `en_linea` | 10 cajas virtuales consultan `GET /api/v1/affiliations/{document}` durante 30 s mientras corre el lote | 1 468 consultas, **p95 = 42 ms**, máximo 59 ms (límite: 5 s) |

## Resultado de k6 (resumen)

```text
✓ lote aceptado (202)
✓ consulta en línea 200
✓ lote terminado con 10000 resultados
checks.........................: 100.00% 1470 out of 1470
✓ errores......................: 0
http_req_failed................: 0.00%   0 out of 1483
✓ { scenario:en_linea }........: avg=4.17ms med=1.14ms p(95)=42ms max=59.08ms
✓ lote_duracion_segundos.......: max=14.073
lote_resultados................: 10000
```

Los umbrales del script (`errores == 0`, `lote < 300 s`, `p95 en línea < 5 s`) se cumplen; si alguno fallara, k6 termina
con código distinto de cero.

## Por qué rinde así

- Los documentos se procesan con un grupo de 32 trabajadores concurrentes (`service.batch.concurrency` en `config/cajas.yaml`).
- Cada documento consulta las cajas en paralelo; Caja Centro se responde desde memoria (archivo cargado al iniciar).
- Los documentos repetidos dentro del lote se consultan una sola vez.
- El lote tiene su propia política de resiliencia (8 s por caja y 2 reintentos), separada de la consulta en línea (3 s y 1 reintento),
  así un lote nunca deja sin capacidad a las consultas individuales.

Entorno: Docker Desktop sobre Windows 11, cajas simuladas del kit en modo `ok`, 14 de octubre de 2026.
