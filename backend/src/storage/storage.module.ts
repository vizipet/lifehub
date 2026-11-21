import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { STORAGE_SERVICE } from './storage.service';
import { LocalDiskStorageService } from './local-disk-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [
    LocalDiskStorageService,
    {
      provide: STORAGE_SERVICE,
      useExisting: LocalDiskStorageService,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
