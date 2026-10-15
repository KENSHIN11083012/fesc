# Modelo de amenazas

Cada mitigación se demuestra con una prueba automatizada del equipo (`tests/`), que se ejecuta con
`docker compose --profile test run --rm tests` y queda aprobada en el reporte JUnit `test-results/junit.xml`.

| Categoría | Amenaza | Mitigación | Prueba |
|---|---|---|---|
| Autenticación | Una caja sin token, o con un token inventado, consulta afiliaciones de cualquier persona | Token Bearer por caja validado en cada petición con comparación en tiempo constante; sin token válido se responde 401 | test_consulta_sin_token_responde_401 |
| Finalidad | Una caja consulta afiliaciones sin declarar para qué, o con una finalidad no legítima como mercadeo | El parámetro purpose es obligatorio y solo acepta TARIFA_SUBSIDIADA, SUBSIDIO_MONETARIO o VALIDACION_AFILIACION; si no, 400 | test_consulta_con_finalidad_invalida_responde_400 |
| Dato mínimo | La respuesta expone nombre, dirección, teléfono, correo, salario o beneficiarios que entregan las cajas | Los adaptadores solo leen fechas y tipo de afiliado, el modelo interno no tiene campos personales y los presenters arman la respuesta con lista blanca | test_respuesta_sin_datos_personales |
| Secretos | Tokens, llaves o contraseñas quedan escritos en el código o la configuración y terminan publicados en el repositorio | Todos los secretos se leen de variables de entorno (.env fuera de Git); config/cajas.yaml solo tiene referencias ${VARIABLE} | test_secretos_no_escritos_en_codigo_ni_configuracion |
| Auditoría | No queda rastro de quién consultó a una persona, o la bitácora expone el documento completo | Cada consulta registra fecha, caja, finalidad y resultado con el documento enmascarado (últimos 4 dígitos); solo ADMIN_TOKEN la lee | test_auditoria_registra_campos_y_documento_enmascarado |

## Amenazas adicionales consideradas

| Amenaza | Mitigación | Prueba |
|---|---|---|
| Una caja lee la auditoría de las demás | La ruta de auditoría exige el token de administración; un token de caja recibe 403 | test_auditoria_con_token_de_caja_responde_403 |
| Una caja ve el lote enviado por otra | El estado del lote solo es visible para la caja que lo envió (otra recibe 404) | test_lote_idempotente_y_con_resultados |
| Una caja caída provoca un falso "no afiliado" y se otorga un subsidio indebido | Resultado INDETERMINADO con la caja en unavailable | test_caja_norte_caida_responde_indeterminado |
| Una caja lenta bloquea el servicio (denegación de servicio indirecta) | Presupuesto de tiempo por caja y consultas en paralelo | test_caja_norte_lenta_responde_en_menos_de_5_segundos |
| El archivo de Centro carga datos personales en memoria | Solo se leen las columnas de documento, fechas y tipo | test_archivo_centro_descarta_nombre_y_salario |
