export interface User {
  user_id: number;
  username: string;
  roles: string[];
  /** `false` when the account is not active yet (e.g. Google sign-in before admin approval). */
  is_active?: boolean;
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
