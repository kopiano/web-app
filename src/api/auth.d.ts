export function register(data: {
  name: string;
  email: string;
  password: string;
}): Promise<unknown>;
export function login(data: {
  username: string;
  password: string;
}): Promise<unknown>;
export function logout(): Promise<unknown>;
