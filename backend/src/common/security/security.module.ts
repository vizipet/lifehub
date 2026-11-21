import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CpfProtector } from './cpf';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CpfProtector],
  exports: [CpfProtector],
})
export class SecurityModule {}
