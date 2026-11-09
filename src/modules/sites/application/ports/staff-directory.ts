export interface EmployeeSite {
  id: string;
  fullName: string;
  siteId: string;
}

export abstract class StaffDirectory {
  abstract findMany(ids: string[]): Promise<EmployeeSite[]>;
}
