import { IsBoolean } from "class-validator";

export class SetFavoriteDto {
  @IsBoolean()
  favorite!: boolean;
}
