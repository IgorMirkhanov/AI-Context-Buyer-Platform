import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

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

export class UpdateLlmSpendCapDto {
  /** null clears the cap (unlimited). */
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  llmMonthlyCapUsd!: number | null;
}
