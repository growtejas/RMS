export interface User {
  user_id: number;
  username: string;
  roles: string[];
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<User>;
  refreshSession: () => Promise<User | null>;
  logout: () => void;
  clearError: () => void;
}
