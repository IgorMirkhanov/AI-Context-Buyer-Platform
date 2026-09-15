import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class EditSemanticKeywordsDto {
  @IsUUID()
  clusterId!: string;

  @IsIn(['add', 'remove'])
  action!: 'add' | 'remove';

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  phrases!: string[];

  @IsOptional()
  @IsIn(['hot', 'warm', 'navigational'])
  intent?: 'hot' | 'warm' | 'navigational';
}
