import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { SemanticService } from './semantic.service';
import { SemanticController } from './semantic.controller';

@Module({
  imports: [ConnectorsModule],
  controllers: [SemanticController],
  providers: [SemanticService],
  exports: [SemanticService],
})
export class SemanticModule {}
