import { Global, Module } from '@nestjs/common';
import { PipelineQueue } from '../pipeline/pipeline.queue';

@Global()
@Module({
  providers: [PipelineQueue],
  exports: [PipelineQueue],
})
export class JobsModule {}
