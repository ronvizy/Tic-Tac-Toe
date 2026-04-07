import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { AuthTokenPayload, StoredUser } from './auth.types';
import { StorageService } from './storage.service';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class AuthService {
  private readonly tokenSecret = process.env.AUTH_SECRET || 'dev-only-secret-change-me';

  constructor(private readonly storageService: StorageService) {}

  async signup(username: string, password: string): Promise<{ token: string; user: Pick<StoredUser, 'id' | 'username'> }> {
    const normalizedUsername = this.normalizeUsername(username);
    this.validatePassword(password);

    const data = await this.storageService.read();
    if (data.users.some((user) => user.username === normalizedUsername)) {
      throw new BadRequestException('Username is already taken.');
    }

    const user: StoredUser = {
      id: randomBytes(12).toString('hex'),
      username: normalizedUsername,
      passwordHash: this.hashPassword(password),
      createdAt: new Date().toISOString(),
    };

    data.users.push(user);
    await this.storageService.write(data);

    return {
      token: this.issueToken(user),
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  async login(username: string, password: string): Promise<{ token: string; user: Pick<StoredUser, 'id' | 'username'> }> {
    const normalizedUsername = this.normalizeUsername(username);
    const data = await this.storageService.read();
    const user = data.users.find((entry) => entry.username === normalizedUsername);

    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    return {
      token: this.issueToken(user),
      user: {
        id: user.id,
        username: user.username,
      },
    };
  }

  async checkAvailability(username: string): Promise<{ available: boolean; normalizedUsername: string; suggestions: string[] }> {
    const normalizedUsername = this.normalizeUsername(username, false);
    const data = await this.storageService.read();
    const existing = new Set(data.users.map((user) => user.username));

    if (!normalizedUsername) {
      return {
        available: false,
        normalizedUsername: '',
        suggestions: [],
      };
    }

    return {
      available: !existing.has(normalizedUsername),
      normalizedUsername,
      suggestions: this.generateSuggestions(normalizedUsername, existing),
    };
  }

  async getProfileFromToken(token?: string): Promise<Pick<StoredUser, 'id' | 'username'>> {
    if (!token) {
      throw new UnauthorizedException('Missing auth token.');
    }

    const payload = this.verifyToken(token);
    const data = await this.storageService.read();
    const user = data.users.find((entry) => entry.id === payload.sub && entry.username === payload.username);

    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }

    return {
      id: user.id,
      username: user.username,
    };
  }

  private normalizeUsername(username: string, throwOnInvalid = true): string {
    const normalized = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);

    if (normalized.length >= 3) {
      return normalized;
    }

    if (!throwOnInvalid) {
      return normalized;
    }

    throw new BadRequestException('Username must be at least 3 characters and use letters, numbers, or underscores.');
  }

  private validatePassword(password: string): void {
    if (password.trim().length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    }
  }

  private hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) {
      return false;
    }

    const candidateHash = scryptSync(password, salt, 64).toString('hex');
    const originalBuffer = Buffer.from(originalHash, 'hex');
    const candidateBuffer = Buffer.from(candidateHash, 'hex');

    if (originalBuffer.length !== candidateBuffer.length) {
      return false;
    }

    return timingSafeEqual(originalBuffer, candidateBuffer);
  }

  private issueToken(user: Pick<StoredUser, 'id' | 'username'>): string {
    const payload: AuthTokenPayload = {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    const signature = createHmac('sha256', this.tokenSecret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  private verifyToken(token: string): AuthTokenPayload {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid auth token.');
    }

    const expectedSignature = createHmac('sha256', this.tokenSecret)
      .update(encodedPayload)
      .digest('base64url');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      throw new UnauthorizedException('Invalid auth token.');
    }

    if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
      throw new UnauthorizedException('Invalid auth token.');
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as AuthTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Session has expired.');
    }

    return payload;
  }

  private generateSuggestions(base: string, existing: Set<string>): string[] {
    const suggestions = new Set<string>();

    if (!existing.has(base)) {
      suggestions.add(base);
    }

    for (const suffix of ['play', 'live', 'pro']) {
      const candidate = `${base}_${suffix}`.slice(0, 20);
      if (!existing.has(candidate)) {
        suggestions.add(candidate);
      }
    }

    while (suggestions.size < 4) {
      const candidate = `${base}${Math.floor(100 + Math.random() * 900)}`.slice(0, 20);
      if (!existing.has(candidate)) {
        suggestions.add(candidate);
      }
      if (suggestions.size > 10) {
        break;
      }
    }

    return [...suggestions].slice(0, 4);
  }
}
