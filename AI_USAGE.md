# Uso de inteligencia artificial

Se usó un asistente de IA como apoyo de ingeniería durante el reto. Las decisiones de stack, alcance y arquitectura las tomó
el integrante; todo lo generado se ejecutó, se revisó y se verificó con el validador del kit, las pruebas automatizadas y la
prueba de carga antes de incorporarlo.

## Uso 1
- Herramienta: Claude (Claude Code)
- Para qué se usó: analizar el kit del reto (RETO.md, RUBRICA.md, cajas simuladas y validador) y proponer un stack tecnológico
- Prompt principal (resumido): "Analiza todo el proyecto, qué hay que cumplir, cómo se califica y qué tecnología conviene"
- Qué produjo: un desglose de puntos y trampas del reto, y la recomendación de usar Python con FastAPI y luego Fastify con JavaScript
- Qué modificó o corrigió el equipo: se descartó Python y se eligió Node con Express y TypeScript, porque es el stack que domina el integrante y debe poder mantener y explicar todo el código

## Uso 2
- Herramienta: Claude (Claude Code)
- Para qué se usó: definir el alcance y la arquitectura del servicio
- Prompt principal (resumido): "Quiero componentización, una arquitectura limpia, bien documentada y siguiendo SOLID"
- Qué produjo: una propuesta de arquitectura hexagonal con puertos, un adaptador por caja, decorator de resiliencia y fábrica por configuración
- Qué modificó o corrigió el equipo: el equipo fijó SOLID y componentización como requisito, evaluó un frontend en Astro y lo descartó porque no aporta a la calificación ni sirve como backend de APIs

## Uso 3
- Herramienta: Claude (Claude Code)
- Para qué se usó: generar las pruebas automatizadas del servicio y del decorator de resiliencia
- Prompt principal (resumido): "Crea al menos 15 pruebas con node --test y reporte JUnit que demuestren el modelo de amenazas"
- Qué produjo: 38 pruebas unitarias y de integración; una de ellas (corte por tiempo de una caja lenta) aprobaba en menos de 1 ms
- Qué modificó o corrigió el equipo: al revisar los tiempos del reporte se detectó que esa prueba no consultaba la caja porque el presupuesto era menor que el mínimo por intento; se ajustó para verificar que sí intenta y se rinde a los 300 ms

## Uso 4
- Herramienta: Claude (Claude Code)
- Para qué se usó: implementar la carga de config/cajas.yaml con variables de entorno para incorporar Caja Sur por configuración
- Prompt principal (resumido): "Las cajas deben declararse en config/cajas.yaml y las direcciones y secretos salir del .env"
- Qué produjo: un cargador que reemplazaba las variables ${VARIABLE} en el texto del YAML antes de interpretarlo
- Qué modificó o corrigió el equipo: se cambió para interpolar después de interpretar el YAML, porque un secreto con caracteres como dos puntos o numeral habría roto el archivo de configuración

## Uso 5
- Herramienta: Claude (Claude Code)
- Para qué se usó: verificar el servicio contra el contrato, la cuarta caja y la prueba de carga del lote
- Prompt principal (resumido): "Verifica todo desde cero con docker compose como lo hará el calificador, incluida Caja Sur"
- Qué produjo: ejecución del validador del kit, simulación de la activación de Caja Sur, comparación de los 10 000 resultados del lote y un script de k6
- Qué modificó o corrigió el equipo: se usaron los resultados reales medidos (14,1 s y 0 errores) en load-test.md en lugar de valores de ejemplo, y se confirmó que con Caja Sur caída la respuesta es INDETERMINADO
