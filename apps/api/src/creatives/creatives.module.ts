import { Module } from '@nestjs/common';
import { CreativesService } from './creatives.service';
import { CreativesController } from './creatives.controller';

@Module({
  controllers: [CreativesController],
  providers: [CreativesService],
  exports: [CreativesService],
})
export class CreativesModule {}
