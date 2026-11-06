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

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@empresa.com` | `Admin123*` |
| Supervisor | `supervisor@empresa.com` | `Super123*` |
| Empleado (Matutino 08:00–17:00, 10 min de tolerancia) | `ana.torres@empresa.com`, `luis.mendoza@empresa.com`, `maria.vera@empresa.com` | `Empleado123*` |
| Empleado (Vespertino 13:00–21:00, 5 min de tolerancia) | `carlos.zambrano@empresa.com`, `sofia.ponce@empresa.com` | `Empleado123*` |

El seed también crea una sede ("Matriz Guayaquil") y marcaciones de ejemplo de los días laborables de las últimas 2 semanas, con algunos atrasos y ausencias. El día actual queda libre para probar.

> La sesión se guarda en `localStorage`, que comparten todas las pestañas del mismo navegador. Para ver al empleado y al supervisor al mismo tiempo, usa una ventana de incógnito u otro navegador.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run setup` | `db:up` + `db:migrate` + `db:seed` |
| `npm run db:up` / `db:down` | Levanta o detiene PostgreSQL (`docker-compose.yml`) |
| `npm run db:migrate` | Aplica las migraciones (`prisma migrate deploy`) |
| `npm run db:seed` | Recarga los datos de ejemplo (**borra todo**) |
| `npm run user:create -- --email <correo> [--role SUPERVISOR]` | Desde la terminal: crea un ADMIN (o SUPERVISOR) o le cambia la contraseña, sin tocar otros datos. Útil para recuperar el acceso |
| `npm run prisma:migrate -- --name x` | Crea una migración nueva al cambiar el esquema |
| `npm run start:dev` | Desarrollo con recarga automática |
| `npm run build` / `start:prod` | Compila / aplica migraciones y arranca (producción) |
| `npm test` | Pruebas unitarias (Jest) |

## Variables de entorno

| Variable | Por defecto | Uso |
|---|---|---|
| `DATABASE_URL` | `postgresql://asistencia:asistencia@localhost:5433/asistencia` | Conexión de Prisma |
| `JWT_SECRET` | — | **Obligatoria.** Cadena larga y aleatoria |
| `JWT_EXPIRES_IN` | `8h` | Duración del token |
| `PORT` | `3000` | Puerto de la API (Railway lo inyecta solo) |
| `CORS_ORIGINS` | `http://localhost:5173,…` | Orígenes del frontend permitidos (REST y WebSocket), separados por coma |
| `APP_TIMEZONE` | `America/Guayaquil` | Zona de referencia para días, atrasos y reportes |
| `MAX_SESSION_HOURS` | `16` | Horas tras las que un ingreso sin salida se considera abandonado |
| `SETUP_CODE` | — | Opcional. Si existe, el formulario de configuración inicial (crear el primer admin) exige este código |

## Reglas de negocio

- **La hora la pone el servidor.** El cliente nunca envía la hora. Se guarda en UTC y se muestra en **America/Guayaquil**.
- **El tipo se deduce.** Si la última marca es IN, la siguiente es OUT, y viceversa. El cliente envía de forma opcional `expectedType` (lo que muestra el botón); si no coincide, el servidor responde 409, por ejemplo *"Ya registraste tu ingreso…"*. Un bloqueo `pg_advisory_xact_lock` por empleado evita duplicados cuando hay doble toque o dos dispositivos.
- **Olvidó marcar la salida.** Si un IN tiene más de `MAX_SESSION_HOURS` (16 h por defecto) sin salida, la siguiente marca vuelve a ser IN. La jornada anterior queda como **"jornada abierta"**, cuenta 0 horas y se puede justificar.
- **Atraso:** es un ingreso posterior a la hora de entrada más la tolerancia. Se cuenta en minutos desde la hora de entrada y solo en el **primer ingreso del día**. Se guarda en la marcación (`isLate`, `lateMinutes`), así que editar un turno no cambia el pasado.
- **Horas trabajadas:** son la suma de los intervalos IN→OUT. Cada jornada se asigna al día de su ingreso, por lo que los turnos nocturnos no se parten a medianoche.
- **Auditoría:** las altas y ediciones de empleados y turnos y las aprobaciones o rechazos de justificaciones se guardan en `AuditLog`, con el antes y el después.
- **Privacidad:** un empleado solo ve sus propias marcaciones y solicitudes. Si intenta justificar una marcación ajena recibe un 404.
- **Alcance de la aprobación:** aprobar una justificación solo cambia su estado y notifica al empleado. No modifica la marcación original.

## API REST

Todas las rutas requieren `Authorization: Bearer <token>`, salvo el login. Los errores siguen siempre el formato `{ statusCode, error, message, details?, timestamp, path }`, con mensajes en español.

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | `/auth/login` | público | `{ email, password }` → `{ accessToken, user }` |
| GET | `/auth/me` | todos | Perfil, ficha de empleado y turno |
| GET | `/auth/setup` | público | `{ needsSetup, requiresCode }`: ¿falta crear el primer admin? |
| POST | `/auth/setup` | público, solo si no hay admins | `{ email, password, siteName?, code? }`: crea el primer ADMIN (y una sede) e inicia su sesión |
| GET / POST / PATCH | `/users`, `/users/:id` | ADMIN | Usuarios del personal (ADMIN y SUPERVISOR): alta, rol, activo y contraseña |
| POST | `/attendance/mark` | EMPLOYEE | `{ expectedType? }`. El servidor decide IN/OUT y la hora |
| GET | `/attendance/me/status` | EMPLOYEE | Estado actual (pantalla principal) |
| GET | `/attendance/me?month=AAAA-MM` | EMPLOYEE | Historial del mes con resumen diario |
| GET | `/attendance/today` | ADMIN, SUPERVISOR | Estado de hoy de todos los empleados activos |
| GET | `/employees?q=&active=true\|false\|all` | ADMIN, SUPERVISOR | Listado y búsqueda |
| GET | `/employees/:id` | ADMIN, SUPERVISOR | Detalle |
| POST / PATCH | `/employees`, `/employees/:id` | ADMIN | Alta y edición (`password` opcional en PATCH) |
| GET | `/shifts`, `/shifts/:id` | ADMIN, SUPERVISOR | Turnos |
| POST / PATCH | `/shifts`, `/shifts/:id` | ADMIN | Alta y edición |
| POST | `/justifications` | EMPLOYEE | `{ attendanceId, reason }` |
| GET | `/justifications?status=` | todos | Supervisores ven todas; un empleado solo las suyas |
| PATCH | `/justifications/:id` | ADMIN, SUPERVISOR | `{ status: APPROVED\|REJECTED, reviewNote? }` |
| GET | `/reports/attendance?from=&to=&employeeId=` | ADMIN, SUPERVISOR | Reporte JSON (máximo 366 días) |
| GET | `/reports/attendance/export?from=&to=&employeeId=` | ADMIN, SUPERVISOR | Archivo `.xlsx` |
| GET | `/health` | público | Estado de la API y de la base de datos |

## WebSocket (Socket.IO)

- **Conexión:** `io(API_URL, { auth: { token } })`, con el mismo JWT de la API. Si el token falta o no es válido, se rechaza en el handshake.
- **Salas:**
  - `admins`: supervisores y administradores.
  - `employee:{id}`: cada empleado.
  - `user:{id}`: sala interna para desconectar a un usuario.
- **Eventos del servidor:**

| Evento | Destino | Payload |
|---|---|---|
| `attendance:marked` | `admins` y el propio empleado (para sus otros dispositivos) | empleado, tipo, hora, `isLate`, `lateMinutes`, estado actualizado |
| `justification:created` | `admins` | justificación con su marcación y empleado |
| `justification:reviewed` | `employee:{id}` | justificación con estado y nota |

El socket **solo notifica**: todas las acciones se hacen por HTTP. Los eventos se emiten después de confirmar la transacción. Al reconectar, el frontend vuelve a consultar todo al servidor, porque la base de datos es la fuente de verdad.

## Pruebas

```bash
npm test
```

- `src/attendance/attendance.domain.spec.ts`: alternancia IN/OUT, atraso, horas trabajadas, jornadas abiertas, turnos nocturnos y zona horaria.
- `src/reports/excel.spec.ts`: estructura y valores del Excel exportado.

## Estructura

```
prisma/            schema.prisma · migrations/ · seed.ts
src/
  attendance/      attendance.domain.ts (lógica pura + pruebas) · servicio · controlador
  auth/            login, JWT, estrategia
  common/          guards de JWT y roles, decoradores, filtro de errores, validaciones
  employees/  shifts/  justifications/  reports/ (incluye excel.ts)
  audit/           AuditService
  health/          /health para el healthcheck
  realtime/        gateway de Socket.IO y adaptador de CORS
Dockerfile         imagen de producción
railway.json       configuración de despliegue en Railway
docs/              guía de despliegue y un Excel de ejemplo
```

## Despliegue

La guía paso a paso (backend, frontend y base de datos en Railway) está en [docs/DEPLOY_RAILWAY.md](docs/DEPLOY_RAILWAY.md).

## Fuera de alcance y puntos de extensión

| Funcionalidad | Punto de extensión preparado |
|---|---|
| Geocerca | `Site.lat`, `Site.lng`, `Site.radiusMeters` ya existen. La validación iría en `AttendanceService.mark` antes de crear la marca |
| Selfie, QR rotativo, kiosco | Ampliar el enum `AttendanceSource` (hoy solo `WEB`) y agregar el campo de evidencia en `Attendance` |
| Multiempresa y multisede | `Employee.siteId` ya existe. Agregar `Company` sobre `Site` y filtrar las salas de socket por sede |
| Notificaciones push | La PWA ya tiene service worker. Suscribir con Web Push en los mismos puntos donde se emiten los eventos del socket |
| Nómina | Los reportes y la exportación ya entregan horas y atrasos por día |

Mejoras sugeridas antes de producción:
- Refresh token o cookie `httpOnly` en lugar de `localStorage`.
- Rate limiting en el login.
- Calendario laboral y feriados para calcular ausencias.
- Corregir la marcación original al aprobar una justificación.
- Pruebas e2e.
