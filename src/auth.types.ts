export interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface AuthTokenPayload {
  sub: string;
  username: string;
  exp: number;
}
