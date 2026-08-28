import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertAiProviderDto {
  @IsIn(['anthropic', 'openai'])
  provider!: 'anthropic' | 'openai';

  @IsString()
  @MinLength(8)
  apiKey!: string;
}

export class VerifyAiProviderDto {
  @IsIn(['anthropic', 'openai'])
  provider!: 'anthropic' | 'openai';

  @IsOptional()
  @IsString()
  @MinLength(8)
  apiKey?: string;
}
