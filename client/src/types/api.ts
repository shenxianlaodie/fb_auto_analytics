// API response types

export interface ApiResponse<T> {
  data: T;
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
    previous?: string;
  };
}

export interface ApiError {
  error: string;
  code?: number;
}

export interface LoginResponse {
  redirectUrl: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  userId?: string;
}

export interface PaginatedRequest {
  limit?: number;
  after?: string;
}

export interface DateRangeRequest {
  dateStart?: string;
  dateEnd?: string;
}
