import { IsEnum } from 'class-validator';
import { AdPlatform } from '@prisma/client';

export class SetPrimaryPlatformDto {
  @IsEnum(AdPlatform)
  primaryPlatform!: AdPlatform;
}
