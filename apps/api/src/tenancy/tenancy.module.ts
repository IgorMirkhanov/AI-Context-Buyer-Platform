import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessService } from './access.service';
import { ProjectAccessGuard } from './project-access.guard';
import { RolesGuard } from './roles.guard';
import { TenancyController } from './tenancy.controller';
import { TenancyService } from './tenancy.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [TenancyController],
  providers: [AccessService, ProjectAccessGuard, RolesGuard, TenancyService],
  exports: [AccessService, ProjectAccessGuard, RolesGuard],
})
export class TenancyModule {}
