interface RequestConfig {
  params?: Record<string, unknown>;
}

declare const request: {
  get<T = unknown>(url: string, config?: RequestConfig): Promise<{ data: T }>;
  post<T = unknown>(url: string, data?: unknown): Promise<{ data: T }>;
  put<T = unknown>(url: string, data?: unknown): Promise<{ data: T }>;
  patch<T = unknown>(url: string, data?: unknown): Promise<{ data: T }>;
  delete<T = unknown>(url: string): Promise<{ data: T }>;
};

export default request;
