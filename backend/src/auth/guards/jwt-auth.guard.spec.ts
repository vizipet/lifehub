import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from '../strategies/jwt.strategy';

@Controller('test-auth')
class TestAuthController {
  @Get()
  @UseGuards(JwtAuthGuard)
  getProtected() {
    return {
      data: {
        ok: true,
      },
    };
  }
}

describe('JwtAuthGuard', () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      controllers: [TestAuthController],
      providers: [JwtAuthGuard, JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('retorna 401 quando não há token', async () => {
    await request(app.getHttpServer())
      .get('/test-auth')
      .expect(401);
  });
});