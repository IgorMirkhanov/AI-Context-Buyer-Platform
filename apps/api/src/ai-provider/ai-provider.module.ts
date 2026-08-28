import { Global, Module } from '@nestjs/common';
import { AiProviderController } from './ai-provider.controller';
import { AiProviderService } from './ai-provider.service';

@Global()
@Module({
  controllers: [AiProviderController],
  providers: [AiProviderService],
  exports: [AiProviderService],
})
export class AiProviderModule {}
