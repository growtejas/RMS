import {
  listCompanyRolesFiltered,
  listDepartmentsWithMeta,
  listLocationsWithMeta,
  listSkillsWithMeta,
} from "@/lib/repositories/reference-data";

/** Read-only reference data (Phase 2). Mirrors FastAPI list endpoints. */

export async function getSkillsCatalog() {
  return listSkillsWithMeta();
}

export async function getDepartmentsCatalog() {
  return listDepartmentsWithMeta();
}

export async function getLocationsCatalog() {
  return listLocationsWithMeta();
}

export async function getCompanyRolesCatalog(includeInactive: boolean) {
  return listCompanyRolesFiltered(includeInactive);
}
