import { Employee } from '../../database/entites/employee.entity';

type EmployeeNameParts = Pick<
  Employee,
  'firstName' | 'lastName' | 'email' | 'id'
>;

export function getEmployeeFullName(
  employee?: EmployeeNameParts | null,
): string {
  if (!employee) return '';

  const fullName = [employee.firstName, employee.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

  return fullName || employee.email || employee.id || '';
}
