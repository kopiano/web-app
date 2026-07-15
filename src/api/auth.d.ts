export function register(data: {
  name?: string;
  username?: string;
  password: string;
  email?: string;
}): Promise<unknown>;

export function login(data: {
  username: string;
  password: string;
}): Promise<unknown>;

export function logout(): Promise<unknown>;
export function gitGithubLogin(): void;
export function refresh(): Promise<unknown>;
