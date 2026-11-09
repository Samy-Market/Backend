import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as readline from 'node:readline';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

async function askHiddenMany(questions: string[]): Promise<string[]> {
  type RL = readline.Interface & { _writeToOutput: (s: string) => void };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true }) as RL;
  const write = rl._writeToOutput.bind(rl);
  let muted = false;
  rl._writeToOutput = (s: string) => {
    if (!muted) write(s);
  };
  const answers: string[] = [];
  for (const q of questions) {
    muted = false;
    const answer = await new Promise<string>((resolve) => {
      rl.question(q, resolve);
      muted = true;
    });
    muted = false;
    write('\n');
    answers.push(answer);
  }
  rl.close();
  return answers;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const roleArg = (arg('role') ?? 'ADMIN').toUpperCase();
  const siteName = arg('site') ?? 'Sede principal';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail('Indica un correo válido:  npm run user:create -- --email admin@miempresa.com');
  }
  if (roleArg !== 'ADMIN' && roleArg !== 'SUPERVISOR') fail('El rol debe ser ADMIN o SUPERVISOR.');
  const role = roleArg as Role;

  const host = /@([^:/?]+)/.exec(process.env.DATABASE_URL ?? '')?.[1] ?? '(desconocido)';
  console.log(`Base de datos: ${host}`);
  console.log(`Usuario: ${email} · Rol: ${role}`);

  let password = process.env.NEW_USER_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) fail('Ejecuta el comando en una terminal o define NEW_USER_PASSWORD.');
    const [first, again] = await askHiddenMany(['Contraseña (8 a 15 caracteres): ', 'Repite la contraseña: ']);
    if (first !== again) fail('Las contraseñas no coinciden.');
    password = first;
  }
  if (password.length < 8 || password.length > 15) fail('La contraseña debe tener entre 8 y 15 caracteres.');
  if (password !== password.trim()) fail('La contraseña no puede empezar ni terminar con espacios.');

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email }, include: { employee: true } });
  if (existing?.employee) {
    fail('Ese correo pertenece a un empleado. Usa otro correo para el usuario administrador.');
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash, role, active: true },
    update: { passwordHash, role, active: true },
  });

  let site = await prisma.site.findFirst();
  if (!site) site = await prisma.site.create({ data: { name: siteName } });

  console.log(
    `\n✔ ${existing ? 'Usuario actualizado' : 'Usuario creado'}: ${user.email} (${role})` +
      `\n  Sede: ${site.name}` +
      '\n  Ya puedes iniciar sesión en el frontend.\n',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
