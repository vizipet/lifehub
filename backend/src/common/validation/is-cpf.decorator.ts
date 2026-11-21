import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidCpf } from '../security/cpf';

export function IsCpf(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName,
      options: { message: 'CPF inválido.', ...options },
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidCpf(value),
      },
    });
  };
}

/** Data no formato AAAA-MM-DD, não futura e depois de 1900. */
export function IsPastIsoDate(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isPastIsoDate',
      target: object.constructor,
      propertyName,
      options: { message: 'Data de nascimento inválida.', ...options },
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
          const date = new Date(`${value}T00:00:00Z`);
          if (Number.isNaN(date.getTime())) return false;
          if (date.toISOString().slice(0, 10) !== value) return false;
          return date >= new Date('1900-01-01T00:00:00Z') && date <= new Date();
        },
      },
    });
  };
}
