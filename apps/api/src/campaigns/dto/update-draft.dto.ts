import { IsObject } from 'class-validator';

export class UpdateCampaignDraftDto {
  @IsObject()
  structure!: Record<string, unknown>;
}
