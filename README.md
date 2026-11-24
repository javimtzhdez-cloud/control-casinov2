# Organización Calderón · aplicación para pruebas

Diseño aprobado con logo, cabecera y cuatro secciones: Verificar disponibilidad, Lista de eventos, Personal y Sobres. Casinos: **Esmeralda, Sophia, Anakai y Regina**. Python 3.12 y Streamlit 1.67.0, con interfaz HTML/CSS/JavaScript conectada al servidor mediante Components v2.

**Esta actualización incluye las cuatro mejoras solicitadas. No se ha publicado en tu cuenta.**

## Actualizar tu repositorio actual

1. Antes de reiniciar, descarga tu respaldo JSON en **Respaldo y pruebas**. Una sesión de pruebas puede perderse al reiniciar.
2. Descomprime el ZIP actualizado. En `control-casinov2`, usa **Add file → Upload files** y sube todos los archivos descomprimidos para reemplazar los anteriores; confirma con **Commit changes**.
3. Conserva `app.py` en la raíz. No cambies ni publiques tus Secrets. Streamlit tomará el cambio del repositorio; si sigue apareciendo la versión anterior, reinicia la app y vuelve a abrirla.
4. Los datos de PostgreSQL no se vacían con esta actualización. Los respaldos Calderón 2 siguen siendo compatibles; el plan semanal se configura en Sobres.
5. La nueva regla de limpieza también se aplica al guardar fichas existentes: corrige horarios antiguos que dejen menos de seis horas libres.

## Publicar y probar, sin instalar nada en Windows

1. Descomprime `Organizacion_Calderon_GitHub_Pruebas.zip`.
2. En GitHub crea un repositorio nuevo, por ejemplo **organizacion-calderon-pruebas**. Así puedes conservar tu versión anterior.
3. Elige **Add file → Upload files**. Sube **el contenido descomprimido**, incluidos archivos y carpetas. No subas sólo el ZIP ni solamente `app.py`.
4. En la raíz del repositorio deben aparecer juntos `app.py`, `calderon_runtime.py`, `backend.py`, `storage.py`, `printing.py`, `ui.html`, `ui.css`, `ui.js` y `requirements.txt`. Conserva también `.streamlit/config.toml`. El resto son guía y pruebas de desarrollo.
5. Pulsa **Commit changes**.
6. Abre https://share.streamlit.io, elige **Create app** y conecta ese repositorio.
7. Indica la rama **main** y el archivo principal **app.py**. En **Advanced settings**, selecciona **Python 3.12**.
8. Para esta primera prueba, deja **Secrets vacío** y pulsa **Deploy**.
9. Cuando termine, abre el enlace de tu aplicación. Debe aparecer un aviso **MODO PRUEBAS** y la portada de Organización Calderón.

Si ves un error de archivo faltante, comprueba que todos los archivos anteriores estén al lado de `app.py`. Si aparece un error sobre Components v2, confirma que subiste el `requirements.txt` nuevo y reinicia la aplicación para que se instale Streamlit 1.67.0.

## Qué guarda el modo pruebas

Se abre con **40 empleados ficticios, ocho eventos y 64 asignaciones**. Los nombres dicen “Personal de prueba”. No necesita cuentas, contraseñas ni Supabase.

Los cambios pasan por el servidor y se conservan al cambiar de sección dentro de **esa sesión de Streamlit**. El modo pruebas no es almacenamiento permanente: cerrar la sesión, recargar perdiendo la conexión o reiniciar la aplicación puede reiniciar la demostración. Tampoco comparte datos entre distintos navegadores. No introduzcas información real en este modo.

Abajo, en **Respaldo y pruebas**, puedes descargar el JSON completo. Para probar una base vacía, confirma la casilla y pulsa **Vaciar pruebas**. Para importar un respaldo, primero la base debe estar vacía. El JSON no contiene contraseñas. No lo subas a un repositorio si contiene información real.

En los guardados debe aparecer **Guardado** en la cabecera. Si aparece un conflicto entre sesiones, la aplicación carga los datos actuales y rechaza el cambio que partía de una versión anterior; revisa y repite esa operación. Si se pierde la conexión al confirmar, pulsa **Actualizar** antes de repetir un cobro.

## Recorrido recomendado para probar

### 1. Personal

- Entra a **Personal → Agregar personal**.
- Escribe nombre, uno de los ocho roles y casino habitual.
- Guarda y comprueba que aparece en el directorio y que la cabecera confirma el guardado.
- Cada fila tiene **Editar** para cambiar nombre, rol y casino, y **Eliminar**.
- Si hay historial, Eliminar da de baja a la persona y conserva turnos y pagos. Libera sus turnos futuros sin anticipos; los turnos con dinero registrado se conservan. Una persona dada de baja no recibe nuevas asignaciones automáticas.
- Los roles son Mesero, Maestro de ceremonias, DJ, Cocina, Baños, Poli, Puerta y Barra.

### 2. Disponibilidad y horarios

- Entra a **Verificar disponibilidad**. En computadora aparecen los cuatro calendarios; en teléfono se cambia de casino con las pestañas.
- Puedes cambiar el mes y el año; las fechas se calculan realmente.
- Selecciona un día libre y pulsa **Agendar este día**.
- Elige nombre e inicio. El fin se calcula **cinco horas después**.
- El inicio más tarde permitido es **10:00 p. m.**, con fin **3:00 a. m. del día siguiente**.
- Prueba un inicio de 10:01 p. m.: debe rechazarlo. Exige **seis horas libres desde el fin de un evento hasta el inicio del siguiente** en ese salón, incluso al cambiar de fecha. Por ejemplo, si acaba a las 3:00 a. m., el siguiente puede empezar desde las 9:00 a. m.; a las 8:59 a. m. se rechaza.

### 3. Ficha y costos

- Entra a **Lista de eventos**, elige el día y abre un evento.
- En **Evento**, captura contratante, personas y precio por persona.
- Prueba **100 personas × $300 = $30,000**.
- En **Menú**, elige Pollo Florentina o Pollo con vegetales: suma **$15 por persona**, dando **$31,500** para ese ejemplo.
- Marca guarnición extra y selecciónala: suma **$10 por persona**, dando **$32,500**.
- Si combinas dos carnes a partir de 200 personas, el suplemento de pollo se aplica **una vez por persona**, aunque ambas carnes sean pollo con extra. Esta regla se muestra en la ficha y puede ajustarse si manejas otra forma de cobrar.
- El mobiliario tiene las opciones de la hoja que compartiste. Sólo se cobran automáticamente los extras cuyo precio está definido en esa hoja: pollo y guarnición adicional. No se inventan cargos por silla, mantel o centro de mesa.
- Pulsa **Guardar cambios de la ficha**. El total automático y el desglose se reflejan en **Pagos** y **Resumen**.

### 4. Cobros del cliente

- Dentro de la ficha abre **Pagos**.
- Registra fecha, concepto (Apartado, Abono o Liquidación), importe, método y referencia opcional.
- El apartado se registra una sola vez; los siguientes movimientos son abonos o liquidación.
- No puedes cobrar más que el saldo. La liquidación tiene que cubrir el saldo exacto.
- Comprueba que el historial y el saldo cambian después de guardar.
- La aplicación **registra** el pago que tú captures; no procesa tarjetas ni mueve dinero por bancos.

### 5. Contrato descargable

- La ficha del evento ya no tiene pestaña Personal.
- En **Evento**, captura contratante, tipo de evento, personas, tarifa, datos del prestador, domicilios y contactos. Guarda la ficha.
- Registra el apartado y abonos desde Pagos. Luego, en Evento, pulsa **Descargar contrato PDF** y el enlace de descarga preparado.
- El PDF contiene inicio y fin con sus fechas, tipo, salón, asistentes, menú, mobiliario, precio y extras, apartado, saldo, condiciones y firmas. Usa exclusivamente los datos confirmados en el servidor.
- Es un **borrador para revisar y completar**. Marca los datos faltantes, calendario de pagos, condiciones de cancelación y datos fiscales. No presenta un registro Profeco inventado ni impone pérdida automática del apartado. Antes de usarlo con clientes deben completarse los datos y revisarse el contenido y registro aplicable.
- En esta misma sección está **Confirmar evento realizado**, disponible cuando ha terminado. Confirmar la realización es independiente de preparar sobres y registrar la entrega del dinero.

### 6. Sobres y asignación semanal automática

- **No hay selector de fecha.** La fecha de México determina la semana actual, de lunes a domingo, y la próxima semana completa. Puedes preparar los sobres el jueves.
- Abrir Sobres sólo consulta las listas. El botón **Preparar sobres de esta semana** permite prepararlos cualquier día: martes, jueves, domingo, etc. Usa la semana de lunes a domingo que contiene la fecha actual de México.
- Abre **Equipo necesario de esta semana y la siguiente**. Por cada evento revisa los mínimos automáticos y define la paga por rol. Guarda y luego pulsa **Preparar sobres de esta semana**: completa las asignaciones de ambas semanas, compara los nombres y recalcula los sobres. Guardar necesidades por sí solo no ejecuta el acomodo.
- Cada evento exige **1 Baños, 2 Barra, 1 Maestro de ceremonias, 1 Poli, 1 Puerta y 2 Cocina**. Puedes aumentar esos puestos, pero la preparación no permite reducirlos por debajo del mínimo. DJ es opcional.
- Debes capturar el número de personas antes de preparar los sobres. Las mesas son de hasta 10 personas y se cuenta también la última mesa incompleta. El objetivo de meseros es uno por cada 20 personas, redondeando hacia abajo, con un mínimo de uno y los refuerzos indispensables para que nadie supere 3 mesas. Ejemplos: 45 personas → 5 mesas → 2 meseros; 55 → 6 mesas → 2; 60 → 6 mesas → normalmente 3; 75 → 8 mesas → 3.
- Si falta personal, se permite hasta **3 mesas por mesero**. Para 60 personas, por ejemplo, pueden asignarse 2 meseros. Antes de añadir refuerzos se procura cubrir los mínimos de todos los eventos de esa fecha. El reparto conserva casino habitual y rotación reciente.
- Las cantidades de meseros se calculan automáticamente; la paga por turno sigue siendo editable. Los eventos de demostración pueden requerir más personal del disponible con estas reglas: agrega o corrige personal y cantidades de invitados antes de preparar.
- Esmeralda, Sophia y Regina priorizan personal habitual. Anakai prioriza trabajadores de otros salones con menos turnos allí durante los últimos 14 días. Entre personas con la misma prioridad se favorece a quien tenga menos trabajo reciente. Los datos antiguos no influyen en la rotación; este cambio no borra registros ni pagos. Se evita asignar una persona dos veces el mismo día y se detectan cruces de madrugada.
- Si falta personal para algún puesto obligatorio o ni atendiendo tres mesas por mesero se cubre el servicio, se rechaza el acomodo semanal completo sin guardar cambios parciales. Agrega personal o corrige cantidades antes de repetir.
- Puedes corregir cantidades y paga de la próxima semana. Los turnos con anticipos no se eliminan ni pueden quedar con paga inferior a lo entregado. No se cambian los turnos de semanas anteriores.
- Sobres muestra cuatro listas desplegables: **Esmeralda, Sophia, Anakai y Regina**. Cada una contiene los sobres con dinero pendiente que se entregarán en ese casino.
- Un empleado aparece una sola vez, en el casino de su **último turno asignado de esta semana**, aunque trabaje en varios salones. No se usa su casino habitual ni el de sus eventos futuros para decidir la entrega.
- La fila muestra nombre, todos los eventos de la próxima semana (fecha, horario AM/PM y casino) y el dinero adeudado por todos los turnos programados de esta semana, descontando anticipos y pagos. Se puede desplegar el desglose de esos turnos.
- Se identifica al maestro de ceremonias asignado al último evento; si falta, se indica **Maestro de ceremonias por asignar**.
- Los hermanos escriben a mano **sólo el nombre y los próximos eventos** en el sobre, preparan el dinero y lo entregan al maestro de ceremonias para que lo reparta. El importe se consulta en pantalla; ya no se ofrece imprimir etiquetas en esta sección.
- **Registrar pago al empleado** sirve cuando éste recibe el dinero. Pasar físicamente los sobres al maestro no marca los salarios como pagados.
- Una persona con turnos esta semana conserva su fila incluso si ya se pagó todo; en ese caso muestra $0 pendiente y el botón de pago está deshabilitado. Un casino sin eventos o sin sobres pendientes conserva su lista y muestra la indicación correspondiente.
- Si preparas los sobres el martes, se incluyen las pagas programadas del viernes, sábado y domingo de esa misma semana aunque no se hayan realizado todavía. Es un importe previsto; vuelve a preparar si cambian los eventos. Preparar no marca turnos como realizados ni dinero como entregado.
- Si alguien sólo trabaja la próxima semana aparece en **Personal por avisar**, con sus turnos para que Omar le envíe un mensaje manualmente. No se envían mensajes automáticamente. Si un empleado no trabaja la próxima semana, el espacio de próximos eventos del sobre queda en blanco.
- Los saldos de semanas anteriores se conservan en **Saldos anteriores pendientes**, separados del total semanal.

### 7. Borrar un error de captura

En la ficha, dentro de Evento, usa **Eliminar evento capturado por error** y confirma. Se impide eliminar un evento que ya tiene cobros de clientes o pagos al personal. Las asignaciones sin movimientos financieros se eliminan junto con el evento.

## Activar datos compartidos entre los tres hermanos

Hazlo después de las pruebas. El modo compartido usa PostgreSQL externo y acceso con contraseña. Un reinicio de Streamlit no elimina los registros que ya se confirmaron en PostgreSQL. La disponibilidad de la base depende de tu proveedor.

1. Crea o utiliza un proyecto PostgreSQL de Supabase. Conserva las contraseñas de forma privada. Si reutilizas el proyecto anterior, cambia las claves que se mostraron en capturas.
2. En Supabase abre **Connect → Session pooler → View parameters**.
3. Abre tu aplicación en Streamlit y ve a **Settings → Secrets**.
4. Copia el contenido de `secrets-compartido.ejemplo.toml`.
5. Reemplaza host, usuario y contraseña con los parámetros que muestra Supabase. El puerto habitual del Session pooler es **5432** y la base, **postgres**.
6. Cambia las tres claves de usuario por claves diferentes de **al menos 12 caracteres**. No conserves el prefijo `CAMBIA_`.
7. Guarda y recarga. Debe mostrar el acceso privado y permitir entrar como `hermano1`, `hermano2` o `hermano3`.

En esta configuración la contraseña de la base va en su propio campo `password`, entre comillas. **No tienes que armar una URL ni codificar el signo `?`.** No subas a GitHub el contenido de Secrets ni un `secrets.toml` real.

Los tres usuarios tienen las mismas funciones. Las sesiones duran hasta ocho horas; cambiar la clave invalida la sesión previa al volver a interactuar. Hay límite de cinco intentos por cuenta en un minuto dentro del proceso actual; no es autenticación con MFA.

La aplicación crea un esquema nuevo **calderon_v2**, independiente de los esquemas de las versiones anteriores. No migra automáticamente el CSV o el ZIP antiguo. Los respaldos de esta versión son JSON con `version: 2`.

El modo compartido comienza vacío. Para llevar una prueba completa a un proyecto de prueba compartido puedes importar el JSON de la demostración a una base vacía. Para una operación real es preferible iniciar sin datos ficticios.

No hay sincronización instantánea mientras otro hermano está escribiendo: usa **Actualizar**. Los guardados comprueban una revisión compartida para evitar que dos sesiones se sobrescriban. Cada solicitud confirmada se registra con usuario y fecha en la base y su identificador evita procesarla dos veces. No es un historial completo de versiones de cada registro.

La conexión exige TLS (`sslmode=require` por defecto). Para verificar además la identidad del servidor, puedes usar una URL PostgreSQL con `sslmode=verify-full` y el certificado raíz del proveedor. El esquema no está en `public` ni se expone por la API REST predeterminada de Supabase.

## Ejecutar localmente, si lo necesitas

Requiere Python 3.12. Abre una terminal en la carpeta donde está `app.py`:

```bash
python -m pip install -r requirements.txt
python -m streamlit run app.py
```

Sin Secrets entra en pruebas. Para usar el modo compartido localmente, crea `.streamlit/secrets.toml` con tus valores privados. No uses la versión antigua de `requirements.txt`.

## Estructura del código

- `app.py`: arranque, modos, acceso, acciones del servidor y respaldos.
- `calderon_runtime.py`: carga por versión de backend, almacenamiento y PDF; evita reutilizar módulos antiguos al actualizar Streamlit.
- `backend.py`: reglas de costos, eventos, disponibilidad, asignaciones y sobres.
- `storage.py`: almacenamiento de sesión y PostgreSQL con control de revisión.
- `printing.py`: contratos y etiquetas PDF con ReportLab y fuentes incorporadas.
- `ui.html`, `ui.css`, `ui.js`: diseño completo, logo integrado e interacción conectada al servidor.
- `tests/`, `package.json`, `.github/workflows/tests.yml`: comprobaciones de desarrollo.

La persistencia utiliza un documento JSONB transaccional para esta escala de 40 personas. Para historiales muy grandes convendría migrarlo a tablas normalizadas y añadir permisos más granulares. El modo compartido de esta entrega está implementado, pero no se ha probado contra tus credenciales ni publicado en tu cuenta.

## Pruebas de desarrollo

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

La interfaz también se verifica con Node.js 22 o superior:

```bash
npm install
npm test
```

No necesitas Node.js para ejecutar la aplicación en Streamlit: sólo para esa prueba de desarrollo. El workflow incluido ejecuta ambas verificaciones en GitHub Actions. Las pruebas no necesitan ni modifican tu base real de Supabase.

Se verificaron **62 pruebas de Python**, incluido el arranque de Streamlit y la recepción/validación de cambios enviados por el componente. Además se probó el recorrido de interfaz → reglas Python → respuesta: alta, edición y baja, precio, extras, cobro, contrato, asignación semanal, pago de nómina, agrupación de sobres por casino y rechazo de conflictos. Las pruebas de interfaz usan DOM simulado; no sustituyen revisar el enlace desplegado en tu teléfono.

No se ejecutó una conexión a tu proyecto Supabase ni se verificó su estado, permisos o límites. Al activar compartido, prueba con un registro ficticio y recarga desde otro navegador para comprobar esa conexión.

## Fuentes oficiales

- Despliegue: https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy
- Secrets: https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/secrets-management
- Components v2: https://docs.streamlit.io/develop/concepts/custom-components/components-v2/examples
- Persistencia de archivos locales: https://docs.streamlit.io/develop/concepts/connections/connecting-to-data
- Supabase PostgreSQL: https://supabase.com/docs/guides/database/connecting-to-postgres

- Información contractual de Profeco: https://www.gob.mx/profeco/articulos/tuviste-que-cancelar-un-banquete
- Registro obligatorio de contratos de adhesión: https://rpca.profeco.gob.mx/informacion.html
