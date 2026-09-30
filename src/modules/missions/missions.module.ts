import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { MissionsController } from './missions.controller';
import { MissionsService } from './missions.service';

@Module({
  // DriversService.lockDriver : verrou partagé avec la désactivation.
  imports: [DriversModule],
  controllers: [MissionsController],
  providers: [MissionsService],
})
export class MissionsModule {}
