import { Body, Controller, Get, Headers, Post, Query, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('availability')
  async availability(@Query('username') username = '') {
    return this.authService.checkAvailability(username);
  }

  @Post('signup')
  async signup(@Body() body: { username?: string; password?: string }) {
    return this.authService.signup(body.username ?? '', body.password ?? '');
  }

  @Post('login')
  async login(@Body() body: { username?: string; password?: string }) {
    return this.authService.login(body.username ?? '', body.password ?? '');
  }

  @Get('me')
  async me(@Headers('authorization') authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return this.authService.getProfileFromToken(token);
  }
}
