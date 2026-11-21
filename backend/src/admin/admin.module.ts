import { SecurityModule } from '../common/security/security.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminVerificationDecisionsController } from './admin-verification-decisions.controller';
import { AdminVerificationDecisionsService } from './admin-verification-decisions.service';
import { StorageModule } from '../storage/storage.module';
import { AdminDocumentReader } from './admin-document-reader.service';
import { DocumentAccessTicketService } from './document-access-ticket.service';
import { AdminVerificationController } from './admin-verification.controller';
import { AdminVerificationService } from './admin-verification.service';
import { AdminVerificationQueriesController } from './admin-verification-queries.controller';
import { AdminVerificationQueriesService } from './admin-verification-queries.service';
import { AdminManagementController } from './admin-management.controller';
import { AdminManagementService } from './admin-management.service';

@Module({
  imports: [AuthModule, SecurityModule, PrismaModule, AuditModule, StorageModule, ConfigModule, NotificationsModule],
  controllers: [AdminManagementController, AdminVerificationQueriesController, AdminVerificationController, AdminVerificationDecisionsController],
  providers: [AdminManagementService, AdminVerificationDecisionsService, AdminVerificationQueriesService, AdminVerificationService, AdminDocumentReader, DocumentAccessTicketService],
})
export class AdminModule {}
