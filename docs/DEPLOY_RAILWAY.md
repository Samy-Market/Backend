# Despliegue en Railway

El sistema está en **dos repositorios** dentro de una organización de GitHub, y en Railway se despliega como **3 servicios** de un mismo proyecto:

| Servicio en Railway | Origen | Cómo se construye |
|---|---|---|
| **Postgres** | Plantilla oficial de Railway | Base de datos administrada |
| **backend** | Repositorio `asistencia-backend` | `Dockerfile` + `railway.json` en la raíz del repo |
| **frontend** | Repositorio `asistencia-frontend` | `Dockerfile` + `railway.json` en la raíz del repo |

```
 Navegador ──HTTPS──▶ frontend (nginx, archivos estáticos)
     │
     └──HTTPS + WSS──▶ backend ──red privada──▶ Postgres
```

El navegador llama al backend directamente por su dominio público. Por eso hay dos variables cruzadas:
- El frontend necesita la URL del backend **al construirse** (`VITE_API_URL`).
- El backend debe permitir el dominio del frontend (`CORS_ORIGINS`).

---

## 0. Requisitos

- Una cuenta en [railway.com](https://railway.com), iniciada con GitHub para que pueda ver los repositorios.
- Los dos repositorios publicados en tu organización de GitHub.
- Que Railway tenga acceso a esa organización. La primera vez que elijas "GitHub Repo", Railway te pide instalar su app de GitHub: elige la **organización** y dale acceso a los dos repositorios (o a todos).

## 1. Crear el proyecto y la base de datos

1. En Railway, elige **New Project → Deploy PostgreSQL**. Se crea el servicio **Postgres**.
2. Verifica que el servicio se llame exactamente `Postgres`: las variables de abajo lo referencian por ese nombre.

## 2. Servicio backend

1. En el proyecto, elige **+ Create → GitHub Repo → asistencia-backend**.
2. Renombra el servicio a **`backend`**: Settings → nombre arriba del todo.
3. En **Settings**:
   - **Root Directory:** vacío.
   - **Builder:** Railway detecta `railway.json` y usa el `Dockerfile` automáticamente.
   - **Networking → Generate Domain.** Anota el dominio, por ejemplo `backend-production-xxxx.up.railway.app`.
4. En **Variables** (puedes usar **Raw Editor** y pegar todo junto):

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   JWT_SECRET=<pega aquí el resultado de: openssl rand -hex 32>
   JWT_EXPIRES_IN=8h
   APP_TIMEZONE=America/Guayaquil
   MAX_SESSION_HOURS=16
   CORS_ORIGINS=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
   ```

   - No definas `PORT`: Railway lo inyecta solo.
   - `CORS_ORIGINS` referencia al servicio `frontend`, que todavía no existe. Agrégala después del paso 3 o escribe el dominio a mano. Para varios orígenes, sepáralos con coma.

5. Despliega. En **Deployments → View logs** deberías ver `All migrations have been successfully applied` y `API escuchando en …`.
6. Abre `https://<dominio-backend>/health`. Debe responder `{"status":"ok","database":"ok",...}`.

## 3. Servicio frontend

1. Elige **+ Create → GitHub Repo → asistencia-frontend** y renombra el servicio a **`frontend`**.
2. En **Settings → Networking → Generate Domain.**
3. En **Variables**:

   ```
   VITE_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
   ```

   Esta variable se usa **durante el build**. Si cambias el dominio del backend, vuelve a desplegar el frontend: Deployments → ⋮ → **Redeploy**.

4. Vuelve al servicio **backend** y confirma que `CORS_ORIGINS` apunte al dominio del frontend.

## 4. Crear el usuario administrador (desde el frontend)

La base de producción arranca **vacía**. Mientras no exista ningún administrador, la pantalla de login muestra **"Configuración inicial"**:

1. Abre el dominio del frontend.
2. Completa el correo, la contraseña (dos veces) y, si quieres, el nombre de la sede.
3. **Crear administrador.** Entras directo al panel como admin.

En cuanto existe un admin, ese formulario **desaparece y el servidor lo bloquea**. Si alguien llega a la página después, solo verá el login normal.

> 🔒 **Recomendado:** hasta que crees tu admin, cualquiera que abra la URL vería ese formulario. Para cerrarlo, agrega en **backend → Variables** `SETUP_CODE=<una palabra secreta>`. El formulario pedirá ese código. Cuando ya tengas tu admin, puedes borrar la variable.

Después, desde el panel:
- **Usuarios:** crea otros administradores y supervisores, y cambia contraseñas (incluida la tuya).
- **Turnos**, y luego **Empleados**. Cada empleado entra con el correo y la contraseña que le asignes.

<details>
<summary>Alternativas desde la terminal (recuperar acceso o cargar datos de demo)</summary>

Necesitas `DATABASE_PUBLIC_URL` (Postgres → Variables → 👁). No la compartas: incluye la contraseña de la base.

- **Recuperar el acceso** si olvidaste la contraseña del admin: crea el usuario o cambia su contraseña sin tocar otros datos.
  ```bash
  DATABASE_URL="<DATABASE_PUBLIC_URL>" npm run user:create -- --email admin@tuempresa.com
  ```
- **Cargar datos de ejemplo** para una demo. ⚠️ Borra todo.
  ```bash
  DATABASE_URL="<DATABASE_PUBLIC_URL>" SEED_ALLOW_REMOTE=true npm run db:seed
  ```
</details>

---

## Cómo se actualiza

Cada vez que haces **Push origin** en GitHub Desktop sobre la rama `main` de uno de los repositorios, Railway vuelve a desplegar **solo ese servicio**. Las migraciones nuevas de Prisma se aplican solas al arrancar el backend.

## Verificación rápida

1. `https://<backend>/health` responde `ok`.
2. En el frontend, inicia sesión como supervisor: arriba a la derecha aparece **"En vivo"**.
3. Desde tu celular, entra como empleado y marca. El dashboard se actualiza al instante.
4. En **Reportes**, exporta un Excel.
5. En el celular, abre el menú del navegador → **Agregar a pantalla de inicio** para instalar la PWA.

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Al crear el servicio no aparece el repositorio | La app de Railway no tiene acceso a la organización | En GitHub: organización → Settings → GitHub Apps → Railway → **Configure** y agrega los repos |
| El login dice *"No se pudo conectar con el servidor"* | `VITE_API_URL` mal escrita, o el frontend se construyó antes de que existiera el dominio del backend | Corrige la variable en **frontend** y haz Redeploy |
| La consola muestra *"blocked by CORS policy"*, o el indicador dice *"Sin conexión en vivo"* | `CORS_ORIGINS` no coincide con el dominio del frontend | Debe ser exactamente `https://<dominio-frontend>`, sin `/` al final |
| `Environment variable not found: DATABASE_URL` | Falta la variable o el servicio Postgres tiene otro nombre | Usa `${{<NombreDelServicio>.DATABASE_URL}}` |
| El healthcheck falla | Falta `JWT_SECRET` o hay un error de migración | Revisa los logs del backend |
| El build del frontend falla: *"falta la variable VITE_API_URL"* | La variable no existe en el servicio | Agrégala en **frontend → Variables** |

## Costos y seguridad

- Railway cobra por uso. Tres servicios pequeños para una demo suelen entrar en el plan Hobby. Revisa la sección **Usage** del proyecto.
- `JWT_SECRET` y `DATABASE_URL` viven solo en las variables de Railway, nunca en GitHub: el `.gitignore` excluye los `.env`.
- Activa los respaldos de la base: Postgres → **Backups**.
