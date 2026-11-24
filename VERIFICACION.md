# Validación de la actualización

- 62 pruebas Python aprobadas: horarios y límite de inicio, limpieza mínima exacta antes y después de medianoche, precios, extras, pagos, nómina actual separada de próxima semana, cierre de semana, acomodo idempotente y atómico, bajas sin pérdida de historial, un único sobre en el casino del último turno, maestros de ceremonias, saldo cero tras liquidación, tarifas futuras, contrato y PDF, respaldo, revisión e idempotencia de guardado.
- Incluyen arranque de Streamlit y aceptación/rechazo de cambios recibidos por Components v2.
- Recorrido de interfaz con servidor Python aprobado: alta → precio/extras → cobro → contrato → acomodo semanal → cambio de necesidades → pago al personal → listas desplegables por casino → edición y eliminación → baja con historial → rechazo de revisión antigua.
- La interfaz se prueba en DOM simulado con Shadow DOM; no sustituye probar el enlace desplegado en un teléfono real.
- Contrato de dos páginas y etiquetas carta 2 × 5 renderizados y revisados visualmente. Las fuentes se incorporan al PDF para impresión consistente. El contenido largo genera continuaciones.
- No se modificó el repositorio del propietario ni se desplegó a Streamlit. La base PostgreSQL del propietario no se probó con sus credenciales.

Se verifican preparación manual desde martes con turnos futuros del fin de semana, comparación con la siguiente semana, avisos manuales, preparación idempotente, rotación que ignora historia anterior a 14 días y rechazo atómico si falta personal.

Las fechas de los casos semanales se fijan en los tests. En la app se utiliza la fecha real de America/Mexico_City. La semana va de lunes a domingo y un turno se imputa a su fecha de inicio, aunque termine de madrugada.

En modo pruebas los datos viven en la sesión de Streamlit. En modo compartido se conserva el esquema PostgreSQL calderon_v2; la actualización no vacía la base. Se recomienda descargar el respaldo antes de reiniciar una sesión de pruebas.

Se verificó el arranque con un backend viejo ya presente en sys.modules y la carga de un backend actualizado dentro del mismo proceso Python, con reglas y almacenamiento de la misma versión.

Se verifican puestos obligatorios aunque se soliciten cantidades cero, meseros por invitados y mesas (incluidos 45, 55, 60 y 75 invitados), reparto con escasez hasta tres mesas por persona, mínimos para varios casinos simultáneos, uso de meseros sobrantes, preparación repetida sin duplicados, captura de invitados y conservación de la operación sin guardados parciales. La interfaz prueba el cálculo de 45 invitados y que el mínimo de Barra no pueda omitirse al preparar.
