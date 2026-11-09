import { applyDecorators, BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsString, Matches, MaxLength, MinLength, ValidateBy } from 'class-validator';
import { cedulaProblem, EMAIL_MAX, PASSWORD_MAX, PASSWORD_MIN } from '../domain/field-rules';

export const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const lowerEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export const IsNewPassword = () =>
  applyDecorators(
    IsString({ message: 'La contraseña es obligatoria.' }),
    MinLength(PASSWORD_MIN, { message: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.` }),
    MaxLength(PASSWORD_MAX, { message: `La contraseña no puede superar ${PASSWORD_MAX} caracteres.` }),
    Matches(/^\S(?:[\s\S]*\S)?$/, { message: 'La contraseña no puede empezar ni terminar con espacios.' }),
  );

export const IsAppEmail = () =>
  applyDecorators(
    IsEmail({}, { message: 'Ingresa un correo válido, por ejemplo nombre@empresa.com.' }),
    MaxLength(EMAIL_MAX, { message: `El correo no puede superar ${EMAIL_MAX} caracteres.` }),
  );

export const IsCedula = () =>
  ValidateBy({
    name: 'isCedula',
    validator: {
      validate: (value: unknown) => typeof value === 'string' && cedulaProblem(value) === null,
      defaultMessage: (args) => (typeof args?.value === 'string' ? cedulaProblem(args.value) : null) ?? 'La cédula es obligatoria.',
    },
  });

function flattenErrors(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.entries(e.constraints ?? {}).map(([key, msg]) =>
      key === 'whitelistValidation' ? `El campo "${field}" no está permitido.` : msg,
    );
    return [...own, ...flattenErrors(e.children ?? [], field)];
  });
}

export const validationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) => new BadRequestException(flattenErrors(errors)),
  });
