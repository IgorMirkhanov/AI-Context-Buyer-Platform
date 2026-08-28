import { IsBoolean } from 'class-validator';

export class UpdateMeDto {
  @IsBoolean()
  beginnerMode!: boolean;
}
