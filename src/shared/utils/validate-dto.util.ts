import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

type DtoConstructor<T extends object> = new () => T;

export type DtoValidationResult<T extends object> =
  | { valid: true; value: T }
  | { valid: false; errors: string[] };

export async function validateDto<T extends object>(
  Dto: DtoConstructor<T>,
  input: Record<string, unknown>,
): Promise<DtoValidationResult<T>> {
  const value = plainToInstance(Dto, input);
  const errors = await validate(value, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return errors.length
    ? { valid: false, errors: getValidationMessages(errors) }
    : { valid: true, value };
}

function getValidationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...getValidationMessages(error.children ?? []),
  ]);
}
