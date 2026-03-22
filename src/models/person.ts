export interface Person {
  id?: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  address: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  count: number;
}
