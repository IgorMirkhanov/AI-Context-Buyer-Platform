import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertAiProviderDto {
  @IsIn(['anthropic', 'openai', 'groq', 'gemini'])
  provider!: 'anthropic' | 'openai' | 'groq' | 'gemini';

  @IsString()
  @MinLength(8)
  apiKey!: string;
}

export class VerifyAiProviderDto {
  @IsIn(['anthropic', 'openai', 'groq', 'gemini'])
  provider!: 'anthropic' | 'openai' | 'groq' | 'gemini';

  @IsOptional()
  @IsString()
  @MinLength(8)
  apiKey?: string;
}
