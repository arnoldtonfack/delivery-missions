import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { readJwtExpiresInSeconds } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: readJwtExpiresInSeconds(config),
        },
        // Algorithme imposé à la vérification : refuse `alg: none` et consorts.
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  // JwtModule exporté : `JwtAuthGuard` (APP_GUARD d'AppModule) injecte JwtService.
  exports: [JwtModule],
})
export class AuthModule {}
