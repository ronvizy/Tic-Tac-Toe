import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { AuthService } from './auth.service';
import { StorageService } from './storage.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..'),
      exclude: ['/socket.io*'],
    }),
  ],
  controllers: [AuthController],
  providers: [StorageService, AuthService, GameGateway, GameService],
})
export class AppModule {}
