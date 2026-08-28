import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdPlatform } from '@prisma/client';

export class TargetAudienceDto {
  @IsString()
  @MinLength(1)
  segment!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pains?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objections?: string[];
}

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(AdPlatform)
  primaryPlatform!: AdPlatform;

  @IsUrl({ require_tld: false })
  websiteUrl!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  geo!: string[];

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  budgetDaily!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  budgetCurrency?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  usp!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TargetAudienceDto)
  targetAudience!: TargetAudienceDto[];

  @IsArray()
  @IsString({ each: true })
  globalNegativeKeywords!: string[];
}
