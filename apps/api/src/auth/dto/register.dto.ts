import { Equals, IsBoolean, IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  organizationName!: string;

  @IsBoolean()
  @Equals(true, { message: 'Terms of service must be accepted' })
  acceptTerms!: boolean;
}
