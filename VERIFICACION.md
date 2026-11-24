# Validación de la actualización

- 41 pruebas Python aprobadas: horarios y límite de inicio, limpieza mínima exacta antes y después de medianoche, precios, extras, pagos, nómina actual separada de próxima semana, cierre de semana, acomodo idempotente y atómico, bajas sin pérdida de historial, un único sobre en el casino del último turno, maestros de ceremonias, saldo cero tras liquidación, tarifas futuras, contrato y PDF, respaldo, revisión e idempotencia de guardado.
- Incluyen arranque de Streamlit y aceptación/rechazo de cambios recibidos por Components v2.
- Recorrido de interfaz con servidor Python aprobado: alta → precio/extras → cobro → contrato → acomodo semanal → cambio de necesidades → pago al personal → listas desplegables por casino → edición y eliminación → baja con historial → rechazo de revisión antigua.
- La interfaz se prueba en DOM simulado con Shadow DOM; no sustituye probar el enlace desplegado en un teléfono real.
- Contrato de dos páginas y etiquetas carta 2 × 5 renderizados y revisados visualmente. Las fuentes se incorporan al PDF para impresión consistente. El contenido largo genera continuaciones.
- No se modificó el repositorio del propietario ni se desplegó a Streamlit. La base PostgreSQL del propietario no se probó con sus credenciales.

Se verifican preparación manual desde martes con turnos futuros del fin de semana, comparación con la siguiente semana, avisos manuales, preparación idempotente, rotación que ignora historia anterior a 14 días y rechazo atómico si falta personal.

Las fechas de los casos semanales se fijan en los tests. En la app se utiliza la fecha real de America/Mexico_City. La semana va de lunes a domingo y un turno se imputa a su fecha de inicio, aunque termine de madrugada.

En modo pruebas los datos viven en la sesión de Streamlit. En modo compartido se conserva el esquema PostgreSQL calderon_v2; la actualización no vacía la base. Se recomienda descargar el respaldo antes de reiniciar una sesión de pruebas.
