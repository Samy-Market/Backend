# Control de Asistencia: Backend

API REST + WebSocket del sistema de control de ingreso y salida de empleados.

**Stack:** NestJS 10 · TypeScript · Prisma 6 · PostgreSQL 16 · JWT · class-validator · Socket.IO · exceljs

> El frontend vive en su propio repositorio, **asistencia-frontend**.

## Requisitos

- Node.js 20 o superior (probado con 22)
- Docker con Docker Compose (para PostgreSQL en local)

## Puesta en marcha

```bash
npm install
cp .env.example .env        # y cambia JWT_SECRET (openssl rand -hex 32)
npm run setup               # levanta PostgreSQL (puerto 5433), migra y carga datos de ejemplo
npm run start:dev           # http://localhost:3000
```

Comprueba que responde abriendo http://localhost:3000/health.

> El seed **borra y recrea** todos los datos. Contra una base remota se niega a correr salvo que pases `SEED_ALLOW_REMOTE=true`.

## Primer administrador

En una base **vacía** (por ejemplo, recién desplegada) no hace falta el seed: el frontend muestra **"Configuración inicial"** para crear el primer admin. El endpoint se cierra en cuanto existe uno. Después, los demás administradores y supervisores se crean en **Usuarios**.

Reglas de la gestión de usuarios:

- Un admin no puede desactivarse ni cambiar su propio rol.
- Siempre queda al menos un admin activo.
- Todo cambio queda en `AuditLog`.

## Credenciales de prueba

| Rol                                                    | Correo                                                                         | Contraseña     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------- |
| Administrador                                          | `admin@empresa.com`                                                            | `Admin123*`    |
| Supervisor                                             | `supervisor@empresa.com`                                                       | `Super123*`    |
| Empleado (Matutino 08:00–17:00, 10 min de tolerancia)  | `ana.torres@empresa.com`, `luis.mendoza@empresa.com`, `maria.vera@empresa.com` | `Empleado123*` |
| Empleado (Vespertino 13:00–21:00, 5 min de tolerancia) | `carlos.zambrano@empresa.com`, `sofia.ponce@empresa.com`                       | `Empleado123*` |

El seed también crea una sede ("Matriz Guayaquil") y marcaciones de ejemplo de los días laborables de las últimas 2 semanas, con algunos atrasos y ausencias. El día actual queda libre para probar.

> La sesión se guarda en `localStorage`, que comparten todas las pestañas del mismo navegador. Para ver al empleado y al supervisor al mismo tiempo, usa una ventana de incógnito u otro navegador.

## Scripts

| Comando                                                       | Qué hace                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `npm run setup`                                               | `db:up` + `db:migrate` + `db:seed`                                                                                              |
| `npm run db:up` / `db:down`                                   | Levanta o detiene PostgreSQL (`docker-compose.yml`)                                                                             |
| `npm run db:migrate`                                          | Aplica las migraciones (`prisma migrate deploy`)                                                                                |
| `npm run db:seed`                                             | Recarga los datos de ejemplo (**borra todo**)                                                                                   |
| `npm run user:create -- --email <correo> [--role SUPERVISOR]` | Desde la terminal: crea un ADMIN (o SUPERVISOR) o le cambia la contraseña, sin tocar otros datos. Útil para recuperar el acceso |
| `npm run prisma:migrate -- --name x`                          | Crea una migración nueva al cambiar el esquema                                                                                  |
| `npm run start:dev`                                           | Desarrollo con recarga automática                                                                                               |
| `npm run build` / `start:prod`                                | Compila / aplica migraciones y arranca (producción)                                                                             |
| `npm test`                                                    | Pruebas unitarias (Jest)                                                                                                        |
| `npm run lint` / `lint:fix`                                   | Revisa el código con ESLint (TypeScript con tipos) / corrige lo automático                                                      |
| `npm run format` / `format:check`                             | Da formato con Prettier / solo verifica                                                                                         |

## Variables de entorno

| Variable                        | Por defecto                                                    | Uso                                                                                                   |
| ------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | `postgresql://asistencia:asistencia@localhost:5433/asistencia` | Conexión de Prisma                                                                                    |
| `JWT_SECRET`                    | —                                                              | **Obligatoria.** Cadena larga y aleatoria                                                             |
| `JWT_EXPIRES_IN`                | `8h`                                                           | Duración máxima de la sesión: al cumplirse, la app la cierra sola                                     |
| `SESSION_IDLE_MINUTES_STAFF`    | `30`                                                           | Minutos sin actividad tras los que se cierra la sesión de administradores y supervisores (0 = nunca)  |
| `SESSION_IDLE_MINUTES_EMPLOYEE` | `10`                                                           | Igual, para empleados                                                                                 |
| `PORT`                          | `3000`                                                         | Puerto de la API (Railway lo inyecta solo)                                                            |
| `CORS_ORIGINS`                  | `http://localhost:5173,…`                                      | Orígenes del frontend permitidos (REST y WebSocket), separados por coma                               |
| `APP_TIMEZONE`                  | `America/Guayaquil`                                            | Zona de referencia para días, atrasos y reportes                                                      |
| `MAX_SESSION_HOURS`             | `16`                                                           | Horas tras las que un ingreso sin salida se considera abandonado                                      |
| `SETUP_CODE`                    | —                                                              | Opcional. Si existe, el formulario de configuración inicial (crear el primer admin) exige este código |

## Sedes y traslados

- Cada empleado tiene una **sede base** (obligatoria al crearlo). Antes de registrar empleados deben existir las sedes.
- **Traslado:** un supervisor o administrador registra que un empleado trabaja temporalmente en otra sede, entre dos fechas inclusivas (por ejemplo, solo hoy por una emergencia). Durante esas fechas, **cada marcación se guarda con la sede de destino**; al terminar, vuelve sola a su sede base.
- Cada marcación guarda su sede (`Attendance.siteId`). El dashboard y los reportes filtran por **dónde trabajó realmente** cada día, así que un traslado cuenta en la sede de destino.
- Reglas:
  - No se puede trasladar a la propia sede, ni registrar traslados que se cruzan o que ya terminaron.
  - Un traslado en el que ya hubo marcaciones no se borra: se termina cambiando su fecha de fin.
  - Una sede con empleados activos no se puede desactivar, y una con historial no se puede eliminar.
- La migración `sedes_y_traslados` asigna a las marcaciones anteriores la sede base del empleado.

## Horarios rotativos

Pensado para personal de un centro comercial, cuyo horario cambia según el día y rota cada cierto tiempo (por ejemplo, cada 3 meses).

| Concepto                                 | Qué es                                                                                   | Ejemplo                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Turno** (`Shift`)                      | Bloque horario de un día, con su tolerancia                                              | "Mañana 08:00–18:00", "Tarde 11:00–21:00"                                         |
| **Horario** (`Schedule` + `ScheduleDay`) | Plantilla semanal reutilizable: turno o descanso para cada día (1 = lunes … 7 = domingo) | "Rotación A": L mañana, M tarde, X mañana, J tarde, V mañana, S tarde, D descanso |
| **Asignación** (`ScheduleAssignment`)    | Horario de un empleado entre dos fechas (inclusivas; sin fin = indefinido)               | Ana: Rotación A del 01/11 al 31/01                                                |

Reglas:

- El **turno de cada día** sale de la asignación vigente en esa fecha y del día de la semana. Con él se calcula el atraso al marcar.
- **Días de descanso:** si el empleado marca, no hay atraso y no aparece "No ha llegado".
- **Rotar:** al asignar un horario nuevo desde una fecha, la asignación vigente que empezó antes se cierra sola el día anterior. Si choca con otra asignación que empieza dentro del nuevo periodo, se rechaza con un mensaje claro.
- **Historial:** las asignaciones que ya empezaron no se borran (se les pone fecha de fin). Solo se pueden eliminar las futuras.
- **Ausencia:** día de trabajo **ya pasado** sin ninguna marcación. Aparece en el historial del empleado, en los reportes y en el Excel.
- **Alertas:** `/schedules/expiring` y el dashboard avisan de los empleados cuya rotación termina pronto sin tener la siguiente asignada.
- **Migración desde el turno único:** la migración `horarios_rotativos` convierte el turno que tenía cada empleado en un horario "<turno> (todos los días)" asignado desde su primera marcación, así nada cambia hasta que asignes rotaciones nuevas.

## Reglas de negocio

- **La hora la pone el servidor.** El cliente nunca envía la hora. Se guarda en UTC y se muestra en **America/Guayaquil**.
- **El tipo se deduce.** Si la última marca es IN, la siguiente es OUT, y viceversa. El cliente envía de forma opcional `expectedType` (lo que muestra el botón); si no coincide, el servidor responde 409, por ejemplo _"Ya registraste tu ingreso…"_. Un bloqueo `pg_advisory_xact_lock` por empleado evita duplicados cuando hay doble toque o dos dispositivos.
- **Olvidó marcar la salida.** Si un IN tiene más de `MAX_SESSION_HOURS` (16 h por defecto) sin salida, la siguiente marca vuelve a ser IN. La jornada anterior queda como **"jornada abierta"**, cuenta 0 horas y se puede justificar.
- **Atraso:** es un ingreso posterior a la hora de entrada **del turno que le toca ese día** más la tolerancia. Se cuenta en minutos desde la hora de entrada y solo en el **primer ingreso del día**. Se guarda en la marcación (`isLate`, `lateMinutes`), así que editar un turno o un horario no cambia el pasado.
- **Horas trabajadas:** son la suma de los intervalos IN→OUT. Cada jornada se asigna al día de su ingreso, por lo que los turnos nocturnos no se parten a medianoche.
- **Auditoría:** las altas y ediciones de empleados y turnos y las aprobaciones o rechazos de justificaciones se guardan en `AuditLog`, con el antes y el después.
- **Privacidad:** un empleado solo ve sus propias marcaciones y solicitudes. Si intenta justificar una marcación ajena recibe un 404.
- **Alcance de la aprobación:** aprobar una justificación solo cambia su estado y notifica al empleado. No modifica la marcación original.

## API REST

Todas las rutas requieren `Authorization: Bearer <token>`, salvo el login. Los errores siguen siempre el formato `{ statusCode, error, message, details?, timestamp, path }`, con mensajes en español.

| Método                | Ruta                                               | Rol                            | Descripción                                                                                                  |
| --------------------- | -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| POST                  | `/auth/login`                                      | público                        | `{ email, password }` → `{ accessToken, user }`                                                              |
| GET                   | `/auth/me`                                         | todos                          | Perfil, ficha de empleado y turno                                                                            |
| GET                   | `/auth/setup`                                      | público                        | `{ needsSetup, requiresCode }`: ¿falta crear el primer admin?                                                |
| POST                  | `/auth/setup`                                      | público, solo si no hay admins | `{ email, password, siteName?, code? }`: crea el primer ADMIN (y una sede) e inicia su sesión                |
| GET / POST / PATCH    | `/users`, `/users/:id`                             | ADMIN                          | Usuarios del personal (ADMIN y SUPERVISOR): alta, rol, activo y contraseña                                   |
| POST                  | `/attendance/mark`                                 | EMPLOYEE                       | `{ expectedType? }`. El servidor decide IN/OUT y la hora                                                     |
| GET                   | `/attendance/me/status`                            | EMPLOYEE                       | Estado actual (pantalla principal)                                                                           |
| GET                   | `/attendance/me?month=AAAA-MM`                     | EMPLOYEE                       | Historial del mes con resumen diario                                                                         |
| GET                   | `/attendance/today`                                | ADMIN, SUPERVISOR              | Estado de hoy de todos los empleados activos                                                                 |
| GET                   | `/employees?q=&active=true\|false\|all`            | ADMIN, SUPERVISOR              | Listado y búsqueda                                                                                           |
| GET                   | `/employees/:id`                                   | ADMIN, SUPERVISOR              | Detalle                                                                                                      |
| POST / PATCH          | `/employees`, `/employees/:id`                     | ADMIN                          | Alta y edición (`password` opcional en PATCH)                                                                |
| GET                   | `/shifts`, `/shifts/:id`                           | ADMIN, SUPERVISOR              | Turnos                                                                                                       |
| POST / PATCH / DELETE | `/shifts`, `/shifts/:id`                           | ADMIN                          | Alta, edición y baja (solo si ningún horario lo usa)                                                         |
| GET                   | `/schedules`, `/schedules/:id`                     | ADMIN, SUPERVISOR              | Horarios rotativos con sus 7 días y empleados vigentes hoy                                                   |
| POST / PATCH          | `/schedules`, `/schedules/:id`                     | ADMIN                          | `{ name, description?, active?, days: [{ weekday 1–7, shiftId \| null }] × 7 }`                              |
| POST                  | `/schedules/assign`                                | ADMIN                          | `{ scheduleId, employeeIds[], startDate, endDate? }`: asigna a varios empleados (cierra el horario anterior) |
| GET                   | `/schedules/expiring?days=14`                      | ADMIN, SUPERVISOR              | Rotaciones que terminan pronto sin horario siguiente                                                         |
| GET                   | `/employees/:id/assignments`                       | ADMIN, SUPERVISOR              | Historial de horarios del empleado                                                                           |
| PATCH / DELETE        | `/schedule-assignments/:id`                        | ADMIN                          | Cambiar la fecha de fin / quitar una asignación futura                                                       |
| GET                   | `/attendance/me/schedule?from=&to=`                | EMPLOYEE                       | Su horario (por defecto, la semana actual)                                                                   |
| GET                   | `/sites`                                           | ADMIN, SUPERVISOR              | Sedes con empleados activos y traslados entrantes hoy                                                        |
| POST / PATCH / DELETE | `/sites`, `/sites/:id`                             | ADMIN                          | Alta, edición y baja (solo si nunca se usó; si no, desactivar)                                               |
| GET                   | `/transfers?scope=CURRENT\|ALL&siteId=`            | ADMIN, SUPERVISOR              | Traslados vigentes y próximos (o todos)                                                                      |
| POST                  | `/transfers`                                       | ADMIN, SUPERVISOR              | `{ employeeIds[], siteId, startDate, endDate, reason? }`                                                     |
| PATCH / DELETE        | `/transfers/:id`                                   | ADMIN, SUPERVISOR              | Cambiar la fecha de fin / quitar (si aún no hubo marcaciones)                                                |
| POST                  | `/justifications`                                  | EMPLOYEE                       | `{ attendanceId, reason }`                                                                                   |
| GET                   | `/justifications?status=`                          | todos                          | Supervisores ven todas; un empleado solo las suyas                                                           |
| PATCH                 | `/justifications/:id`                              | ADMIN, SUPERVISOR              | `{ status: APPROVED\|REJECTED, reviewNote? }`                                                                |
| GET                   | `/reports/attendance?from=&to=&employeeId=`        | ADMIN, SUPERVISOR              | Reporte JSON (máximo 366 días)                                                                               |
| GET                   | `/reports/attendance/export?from=&to=&employeeId=` | ADMIN, SUPERVISOR              | Archivo `.xlsx`                                                                                              |
| GET                   | `/health`                                          | público                        | Estado de la API y de la base de datos                                                                       |

## WebSocket (Socket.IO)

- **Conexión:** `io(API_URL, { auth: { token } })`, con el mismo JWT de la API. Si el token falta o no es válido, se rechaza en el handshake.
- **Salas:**
  - `admins`: supervisores y administradores.
  - `employee:{id}`: cada empleado.
  - `user:{id}`: sala interna para desconectar a un usuario.
- **Eventos del servidor:**

| Evento                   | Destino                                                     | Payload                                                           |
| ------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `attendance:marked`      | `admins` y el propio empleado (para sus otros dispositivos) | empleado, tipo, hora, `isLate`, `lateMinutes`, estado actualizado |
| `justification:created`  | `admins`                                                    | justificación con su marcación y empleado                         |
| `justification:reviewed` | `employee:{id}`                                             | justificación con estado y nota                                   |

El socket **solo notifica**: todas las acciones se hacen por HTTP. Los eventos se emiten después de confirmar la transacción. Al reconectar, el frontend vuelve a consultar todo al servidor, porque la base de datos es la fuente de verdad.

## Pruebas

```bash
npm test
```

Las pruebas cubren las reglas de negocio puras (capa `domain/`), que no necesitan base de datos:

- `attendance/domain/attendance-rules.spec.ts`: alternancia IN/OUT, atraso, horas trabajadas, jornadas abiertas, turnos nocturnos y zona horaria.
- `schedules/domain/schedule-plan.spec.ts`: turno de cada día según la rotación, cambio de trimestre, descansos, atraso con el turno del día, superposición y recorte de periodos.
- `sites/domain/site-rules.spec.ts`: sede de cada día según los traslados y cruces entre traslados.
- `employees`, `justifications`, `users`, `auth`: horario vigente/siguiente, quién puede revisar, no quedarse sin administradores, quién puede entrar.
- `reports/infrastructure/excel/attendance-workbook.spec.ts`: estructura y valores del Excel exportado.

## Arquitectura (hexagonal)

Cada módulo de negocio se divide en tres capas. Las dependencias siempre apuntan **hacia adentro**: la infraestructura conoce a la aplicación y la aplicación al dominio, nunca al revés.

```
            HTTP (controladores, DTO)          Prisma (repositorios)        Excel, JWT, bcrypt, Socket.IO
                      │                               │                               │
                      ▼                               ▼                               ▼
   ┌──────────────────────────── infrastructure/ (adaptadores) ─────────────────────────────┐
   │   ┌──────────────── application/ (casos de uso + puertos) ─────────────────┐           │
   │   │        ┌────────── domain/ (reglas puras, sin Nest ni Prisma) ───┐      │           │
   │   │        └─────────────────────────────────────────────────────────┘      │           │
   │   └──────────────────────────────────────────────────────────────────────────┘           │
   └──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **domain/**: las reglas del negocio como funciones puras (¿toca ingreso o salida?, ¿hay atraso?, ¿qué turno toca hoy?, ¿en qué sede trabaja?). Se prueban sin base de datos.
- **application/**: los casos de uso (marcar, crear un empleado, aprobar una justificación…). Hablan con el exterior solo a través de **puertos**: clases abstractas como `MarkRepository`, `Clock`, `UnitOfWork` o `RealtimeNotifier`.
- **infrastructure/**: los **adaptadores** que implementan esos puertos (Prisma, JWT, bcrypt, ExcelJS, Socket.IO) y los controladores HTTP con sus DTO de validación.

Cada `*.module.ts` es la "caja de conexiones": enlaza cada puerto con su adaptador (`{ provide: Puerto, useClass: Adaptador }`). Cambiar Prisma por otra base de datos, o Excel por PDF, es escribir un adaptador nuevo sin tocar las reglas.

Cómo se aplica SOLID:

- **Responsabilidad única**: un servicio por caso de uso (`SitesService`, `TransfersService`, `SiteLocator`…); el cálculo de reportes vive en el dominio y el Excel en su propio adaptador.
- **Abierto/cerrado e inversión de dependencias**: los servicios dependen de puertos abstractos, no de Prisma ni de Nest.
- **Segregación de interfaces**: cada módulo declara solo lo que necesita de otro (`EmployeeLookup`, `StaffDirectory`, `AttendanceRoster`) en lugar de depender de todo el módulo ajeno.
- Los módulos se comunican solo por su API pública: `SchedulePlanner` (qué turno le toca a cada uno) y `SiteLocator` (dónde trabaja cada día).
- Los errores de negocio (`NotFoundError`, `ConflictError`…) no saben de HTTP; un filtro los traduce a 404, 409, etc.

## Estructura

```
prisma/              schema.prisma · migrations/ · seed.ts · create-user.ts
src/
  main.ts            arranque: CORS, validación, filtro de errores, WebSocket
  app.module.ts      une la infraestructura compartida con los módulos
  config/            zona horaria, duración máxima de jornada, CORS
  shared/
    domain/          errores de negocio, roles, calendario (fechas "yyyy-MM-dd")
    application/     puertos compartidos: Clock, UnitOfWork, AuditLog, PasswordHasher, RealtimeNotifier, SessionVerifier
    infrastructure/  Prisma, auditoría, reloj, bcrypt, gateway de Socket.IO
    http/            guards de JWT y roles, decoradores, filtro de errores, validación
  modules/
    auth/            iniciar sesión, configuración inicial, JWT
    users/           usuarios del personal (administradores y supervisores)
    sites/           sedes y traslados
    shifts/          turnos
    schedules/       horarios rotativos y asignaciones
    employees/       empleados
    attendance/      marcaciones, estado de hoy, historial
    justifications/  justificaciones
    reports/         reporte de asistencia y exportación a Excel
    health/          /health para el healthcheck
Dockerfile           imagen de producción
railway.json         configuración de despliegue en Railway
docs/                guía de despliegue y un Excel de ejemplo
```

Cada carpeta de `modules/` sigue el mismo patrón: `domain/`, `application/` (con `ports/`), `infrastructure/http` e `infrastructure/persistence`.

## Despliegue

La guía paso a paso (backend, frontend y base de datos en Railway) está en [docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md).

## Fuera de alcance y puntos de extensión

| Funcionalidad               | Punto de extensión preparado                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Geocerca                    | `Site.lat`, `Site.lng`, `Site.radiusMeters` ya existen. La validación iría en `AttendanceService.mark` antes de crear la marca |
| Selfie, QR rotativo, kiosco | Ampliar el enum `AttendanceSource` (hoy solo `WEB`) y agregar el campo de evidencia en `Attendance`                            |
| Multiempresa y multisede    | `Employee.siteId` ya existe. Agregar `Company` sobre `Site` y filtrar las salas de socket por sede                             |
| Notificaciones push         | La PWA ya tiene service worker. Suscribir con Web Push en los mismos puntos donde se emiten los eventos del socket             |
| Nómina                      | Los reportes y la exportación ya entregan horas y atrasos por día                                                              |

Mejoras sugeridas antes de producción:

- Refresh token o cookie `httpOnly` en lugar de `localStorage`.
- Rate limiting en el login.
- Calendario laboral y feriados para calcular ausencias.
- Corregir la marcación original al aprobar una justificación.
- Pruebas e2e.
