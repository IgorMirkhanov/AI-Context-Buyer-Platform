import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateBrandingDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  productName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  accentColor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supportEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  slug?: string | null;

  @IsOptional()
  @IsBoolean()
  hidePlatformBadge?: boolean;
}

export class InviteClientDto {
  @IsEmail()
  email!: string;

  /** client = read-only субклиент; member = контекстолог с записью. */
  @IsOptional()
  @IsIn(['client', 'member'])
  role?: 'client' | 'member';
}

export class AcceptInviteDto {
  @IsString()
  token!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}
