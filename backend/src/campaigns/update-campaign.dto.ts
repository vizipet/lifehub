import { PartialType } from '@nestjs/swagger';
import { CreateCampaignDto } from './create-campaign.dto';

// Omitir um campo preserva seu valor; null não apaga campos obrigatórios.
export class UpdateCampaignDto extends PartialType(CreateCampaignDto, { skipNullProperties: false }) {}
