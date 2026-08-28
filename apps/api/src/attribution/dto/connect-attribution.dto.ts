import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AttributionProvider } from '@prisma/client';

export class ConnectAttributionDto {
  @IsEnum(AttributionProvider)
  provider!: AttributionProvider;

  @IsString()
  @MinLength(4)
  token!: string;

  @IsOptional()
  @IsString()
  extra?: string;
}
