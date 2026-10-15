# ADR 004: dato mínimo por diseño, finalidad obligatoria y auditoría enmascarada

- Estado: aceptada
- Fecha: 2026-10-14

## Contexto

La Ley 1581 de 2012 exige finalidad legítima, dato mínimo y trazabilidad. Las cajas devuelven más información de la necesaria:
Norte entrega nombre, dirección, teléfono, correo, salario y beneficiarios; Oriente, nombre, teléfono y dirección; Sur, nombre,
correo y salario; el archivo de Centro, nombre y salario. Para validar una afiliación basta saber si existe, en qué caja y desde
y hasta cuándo.

## Decisión

- **Filtrado en el borde de entrada:** cada adaptador lee únicamente fechas y tipo de afiliado. El modelo interno
  `Affiliation` no tiene campos para datos personales, así que no pueden "colarse" hacia las capas internas.
- **Lista blanca en la salida:** los presenters v1 y v2 construyen la respuesta campo por campo.
- **Finalidad obligatoria:** `purpose` debe ser `TARIFA_SUBSIDIADA`, `SUBSIDIO_MONETARIO` o `VALIDACION_AFILIACION`; si no, 400.
- **Auditoría:** cada consulta (en línea o de lote) registra fecha, caja que consulta, finalidad, resultado y el documento
  **enmascarado** (solo los últimos 4 dígitos); el documento completo nunca se guarda. Solo `ADMIN_TOKEN` la consulta.

## Alternativas

- **Pasar la respuesta de la caja y quitar campos al final:** funciona, pero un campo nuevo de una caja se filtraría si alguien
  olvida actualizar la lista negra; la lista blanca y el modelo sin campos personales lo impiden.
- **Guardar el documento completo cifrado en la auditoría:** permite investigar casos, pero aumenta el riesgo y la
  responsabilidad sobre datos que el servicio no necesita conservar.
- **Finalidad opcional con valor por defecto en línea:** más cómodo para los clientes, pero contradice el principio de finalidad
  verificable de la ley.

## Consecuencias

- Ninguna respuesta contiene datos personales, lo que se verifica con pruebas automatizadas sobre las respuestas reales.
- La auditoría permite responder "quién consultó, para qué y qué obtuvo" sin exponer el documento.
- Para investigar un caso puntual se necesita el documento por otra vía y comparar sus últimos cuatro dígitos con el `requestId`.
- El lote, que no declara finalidad en el contrato, usa `VALIDACION_AFILIACION` por defecto y acepta `?purpose=` para declararla.
