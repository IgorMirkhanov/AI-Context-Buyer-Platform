import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TargetAudienceDto } from './create-project.dto';

export class UpsertBriefDto {
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetCpl?: number;

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
