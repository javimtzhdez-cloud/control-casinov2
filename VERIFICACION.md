# Validación de esta entrega

- 21 pruebas de Python aprobadas: reglas de horarios, límites de inicio, importes en centavos, extras, recálculo en servidor, pagos de cliente, anticipos del personal, sobres, disponibilidad, asignación sin duplicados ni guardado parcial, control de revisiones, idempotencia, PDF y respaldo.
- Incluyen arranque de Streamlit y cambios enviados mediante el estado del componente v2, con aceptación y rechazo del servidor.
- Prueba adicional de interfaz y reglas Python aprobada: alta de personal → edición de precio/extras → cobro → asignación → pago de nómina → PDF → rechazo de una revisión antigua sin perder el estado confirmado.
- La prueba de interfaz ejecuta el código en un DOM simulado con Shadow DOM. No es una prueba visual en un teléfono real ni una prueba de la red de Streamlit Cloud.
- PDF carta, dos columnas, revisado visualmente. Contenido largo genera etiquetas de continuación.
- No se hizo conexión al Supabase del propietario ni despliegue a su GitHub/Streamlit. Para verificar el modo compartido, deben configurarse sus credenciales y comprobar un registro desde otro navegador.

El modo pruebas guarda datos en la sesión del servidor, sin persistencia garantizada tras una desconexión o reinicio. El modo compartido implementa PostgreSQL externo, con revisión transaccional e identificador de solicitud, y requiere el proveedor activo.
