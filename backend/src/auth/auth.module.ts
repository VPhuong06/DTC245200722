import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { config } from '../config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard, RateLimitGuard } from './guards';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ secret: config().jwtSecret, signOptions: { algorithm: 'HS256' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, RateLimitGuard],
  exports: [AuthService, AuthGuard, RateLimitGuard, JwtModule],
})
export class AuthModule {}
