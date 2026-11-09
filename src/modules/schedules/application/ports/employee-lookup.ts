export interface EmployeeBasics {
  id: string;
  fullName: string;
  active: boolean;
}

export abstract class EmployeeLookup {
  abstract findMany(ids: string[]): Promise<EmployeeBasics[]>;
  abstract exists(id: string): Promise<boolean>;
}
