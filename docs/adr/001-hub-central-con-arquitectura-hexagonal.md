# ADR 001: hub central con arquitectura hexagonal (puertos y adaptadores)

- Estado: aceptada
- Fecha: 2026-10-14

## Contexto

Varias cajas de compensación deben validar entre sí si una persona tiene afiliación vigente. Cada caja expone su
información de forma distinta (REST JSON, SOAP/XML, archivo plano diario) y con credenciales propias. Con integraciones
punto a punto, cinco cajas necesitarían diez integraciones diferentes, cada una con su formato, sus fallas y su
mantenimiento. Además, las reglas de negocio (vigencia, veredicto, finalidad y dato mínimo) deben ser las mismas para todas.

## Decisión

Construir un **hub central** (Caja Link) que es el único punto al que consultan las cajas, organizado con
**arquitectura hexagonal**:

- `src/domain/`: reglas puras sin dependencias (normalización, vigencia, veredicto, finalidad, enmascaramiento).
- `src/application/`: casos de uso (consulta, lote, auditoría) que dependen solo de interfaces (`ports/`).
- `src/infrastructure/`: adaptadores concretos (un adaptador por caja, SQLite, configuración, reloj).
- `src/http/`: Express, que solo traduce HTTP y delega en los casos de uso.
- `src/main.ts`: composition root, el único lugar donde se crean e inyectan las implementaciones.

Las dependencias apuntan siempre hacia el dominio. El stack es Node 24 + Express 5 + TypeScript.

## Alternativas

- **Federado (cada caja consulta directamente a las demás):** sin punto central, pero repite la lógica de integración en
  cada caja y vuelve a la explosión de integraciones punto a punto; la auditoría quedaría repartida.
- **Base de datos compartida o réplica central de afiliaciones:** respuestas rápidas, pero obliga a copiar datos personales
  de todas las cajas (contrario al dato mínimo) y crea un nuevo punto de acoplamiento, el mismo problema del sistema legacy.
- **Hub en capas tradicionales (controlador–servicio–repositorio) sin puertos:** más simple al inicio, pero acopla la lógica
  a HTTP y a cada protocolo, y dificulta probar sin red.

## Consecuencias

- Integrar una caja nueva solo afecta a la infraestructura; el dominio y los casos de uso no cambian.
- La lógica de negocio se prueba con dobles de prueba (fakes) en milisegundos, sin levantar cajas.
- La auditoría y la política de seguridad quedan centralizadas en un solo lugar.
- El hub es un componente crítico: se mitiga con un contenedor sin estado en memoria (el estado durable está en SQLite),
  healthcheck y reinicio automático en docker compose.
