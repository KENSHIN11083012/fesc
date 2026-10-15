# ADR 003: tolerancia a fallas con presupuesto de tiempo y resultado INDETERMINADO

- Estado: aceptada
- Fecha: 2026-10-14

## Contexto

Caja Norte a veces está lenta (hasta 8 segundos) o no responde. El contrato exige responder en menos de 5 segundos aunque
una caja esté lenta, y **nunca** decir "no afiliado" si una caja no pudo ser consultada: un falso negativo haría que se
otorgue un subsidio a quien ya está afiliado en otra caja.

## Decisión

- Se consultan todas las cajas **en paralelo** (`Promise.all`); el tiempo total es el de la caja más lenta, no la suma.
- Cada adaptador se envuelve con el decorator `ResilientGateway`, que impone un **presupuesto de tiempo** (3 s en línea) con
  `AbortController` y hace un reintento si la falla es rápida (por ejemplo, un 503 momentáneo) y queda tiempo.
- Si una caja agota su presupuesto o falla, queda en `unavailable` y nunca lanza error hacia el caso de uso.
- Regla de dominio (`decideVerdict`): con coincidencias → `AFILIADO_OTRA_CAJA`; sin coincidencias pero con cajas no
  disponibles → `INDETERMINADO`; solo si todas respondieron y no hay vigentes → `NO_AFILIADO`.
- El lote usa los mismos adaptadores con una política más paciente (8 s y 2 reintentos), porque no tiene a una persona esperando.

## Alternativas

- **Consultas secuenciales sin límite de tiempo:** simple, pero una caja lenta suma 8 s y rompe el contrato de 5 s.
- **Circuit breaker completo:** evita golpear a una caja caída, pero agrega estado y umbrales difíciles de calibrar; con el
  presupuesto de tiempo el impacto de una caja caída ya está acotado. Queda como mejora futura.
- **Responder con datos en caché cuando la caja falla:** más respuestas definitivas, pero con riesgo de informar una afiliación
  ya terminada o de ocultar una nueva; se prefirió la veracidad.

## Consecuencias

- La consulta en línea responde en ~3 s en el peor caso aunque una caja tarde 8 s (verificado con `/__chaos` en modo `slow`).
- Las cajas consumidoras deben tratar `INDETERMINADO` como "reintentar más tarde", no como "no afiliado".
- Los reintentos pueden duplicar alguna petición a una caja que se recupera; las consultas son de solo lectura, así que es seguro.
