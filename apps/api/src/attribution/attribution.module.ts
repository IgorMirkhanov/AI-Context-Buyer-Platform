import { Module } from '@nestjs/common';
import { ConnectorsModule } from '../connectors/connectors.module';
import { AttributionService } from './attribution.service';
import { AttributionController } from './attribution.controller';

@Module({
  imports: [ConnectorsModule],
  controllers: [AttributionController],
  providers: [AttributionService],
})
export class AttributionModule {}
