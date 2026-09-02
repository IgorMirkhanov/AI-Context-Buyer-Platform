import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { OptimizationService } from './optimization.service';
import { OptimizationController } from './optimization.controller';

@Module({
  imports: [ConnectorsModule],
  controllers: [OptimizationController],
  providers: [OptimizationService],
  exports: [OptimizationService],
})
export class OptimizationModule {}
