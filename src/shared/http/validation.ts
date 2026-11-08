import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

export const HHMM_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const trimString = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
export const lowerEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** Aplana los errores de class-validator y traduce los mensajes por defecto que no se personalizaron. */
function flattenErrors(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.entries(e.constraints ?? {}).map(([key, msg]) =>
      key === 'whitelistValidation' ? `El campo "${field}" no está permitido.` : msg,
    );
    return [...own, ...flattenErrors(e.children ?? [], field)];
  });
}

/** Validación global de los cuerpos y parámetros de entrada. */
export const validationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: (errors: ValidationError[]) => new BadRequestException(flattenErrors(errors)),
  });
