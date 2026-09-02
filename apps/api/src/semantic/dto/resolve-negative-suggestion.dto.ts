import { IsIn } from 'class-validator';

export class ResolveNegativeSuggestionDto {
  @IsIn(['accept', 'reject'])
  action!: 'accept' | 'reject';
}
