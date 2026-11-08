/** Datos mínimos de los empleados que necesitan los traslados. */
export interface EmployeeSite {
  id: string;
  fullName: string;
  siteId: string;
}

export abstract class StaffDirectory {
  abstract findMany(ids: string[]): Promise<EmployeeSite[]>;
}
