import { Module, forwardRef } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { ProjectsModule } from '../projects/projects.module';
import { SemanticService } from './semantic.service';
import { SemanticController } from './semantic.controller';

@Module({
  imports: [ConnectorsModule, forwardRef(() => ProjectsModule)],
  controllers: [SemanticController],
  providers: [SemanticService],
  exports: [SemanticService],
})
export class SemanticModule {}
