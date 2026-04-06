import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..'),
      exclude: ['/socket.io*'],
    }),
  ],
  providers: [GameGateway, GameService],
})
export class AppModule {}
