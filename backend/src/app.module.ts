import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AvailabilityModule } from './availability/availability.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { SecurityModule } from './common/security/security.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { ClinicsModule } from './clinics/clinics.module';
import { ServicesModule } from './services/services.module';
import { SearchModule } from './search/search.module';
import { SpecialtiesModule } from './specialties/specialties.module';
import { VerificationModule } from './verification/verification.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { JobsModule } from './jobs/jobs.module';
import { CampaignsModule } from './campaigns/campaigns.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Limite padrão por IP; as rotas de login e cadastro têm limites menores.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    SecurityModule,
    AuditModule,
    AdminModule,
    UsersModule,
    AuthModule,
    PatientsModule,
    PrivacyModule,
    ProfessionalsModule,
    ClinicsModule,
    ServicesModule,
    AvailabilityModule,
    SearchModule,
    SpecialtiesModule,
    VerificationModule,
    AppointmentsModule,
    JobsModule,
    CampaignsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
