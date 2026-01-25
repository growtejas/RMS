import { apiClient } from "./client";

export interface AdminUser {
  user_id: number;
  username: string;
  emp_id?: string | null;
  employee?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  is_active: boolean;
  roles: string[];
}

export interface UpdateUserPayload {
  roles?: string[];
  is_active?: boolean;
  employee_id?: string | null;
}

export const fetchUsers = async (search?: string): Promise<AdminUser[]> => {
  const response = await apiClient.get<AdminUser[]>("/admin/users/", {
    params: search ? { search } : undefined,
  });
  return response.data;
};

export const updateUser = async (
  userId: number,
  payload: UpdateUserPayload,
): Promise<void> => {
  await apiClient.put(`/admin/users/${userId}`, payload);
};

export const deleteUser = async (userId: number): Promise<void> => {
  await apiClient.delete(`/admin/users/${userId}`);
};
