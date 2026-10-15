# ADR 002: un adaptador por protocolo y cajas declaradas por configuración

- Estado: aceptada
- Fecha: 2026-10-14

## Contexto

Las cajas hablan protocolos distintos: Norte usa REST JSON con `X-Api-Key`, Oriente usa SOAP 1.1 con documentos de 12
dígitos y fechas DD/MM/YYYY, Centro publica un archivo plano diario y Sur usa REST v2 con Bearer. El reto exige que una
cuarta caja (Sur) pueda sumarse **sin rehacer el sistema**, y que ningún archivo de `src/` tenga escritas direcciones de cajas.

## Decisión

- Todas las cajas implementan el mismo puerto `CajaGateway.lookup(documento)`, que devuelve afiliaciones en el modelo interno.
- Cada protocolo tiene su adaptador (`norte-rest`, `oriente-soap`, `centro-file`, `sur-rest`) en `src/infrastructure/cajas/`.
- Una **fábrica** (`gateway-factory.ts`) traduce el campo `type` de cada caja a su adaptador.
- Las cajas concretas se declaran en `config/cajas.yaml` (nombre, tipo, si está habilitada y su conexión). Las URL y
  credenciales se leen del entorno con `${VARIABLE}`; Sur se habilita con `enabled: ${CAJA_SUR_ENABLED:-false}`.

## Alternativas

- **Un `if`/`switch` por caja dentro del caso de uso:** rápido de escribir, pero cada caja nueva obliga a modificar la
  lógica central y probarla de nuevo (viola abierto/cerrado).
- **Direcciones y credenciales en el código o en constantes:** prohibido por el reto y obliga a recompilar para cambiar de ambiente.
- **Descubrimiento dinámico de cajas (registro de servicios):** flexible, pero desproporcionado para cuatro cajas y agrega
  otro componente que operar.

## Consecuencias

- Activar Caja Sur es cambiar `CAJA_SUR_ENABLED=true` y reiniciar el servicio; no se toca código.
- Una caja nueva con un protocolo ya soportado se agrega solo con una entrada en `cajas.yaml` y sus variables en `.env`.
- Un protocolo nuevo requiere un adaptador y una línea en la fábrica, sin tocar dominio ni casos de uso.
- La configuración se valida al arrancar: si una caja habilitada no tiene su conexión completa, el servicio no inicia y
  dice qué falta, en lugar de fallar en la primera consulta.
