declare const request: {
  get<T = unknown>(url: string): Promise<{ data: T }>;
  post<T = unknown>(url: string, data?: unknown): Promise<{ data: T }>;
};

export default request;
