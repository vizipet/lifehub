import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCampaignDto } from './create-campaign.dto';
import { ListAdminCampaignsQueryDto, ReviewCampaignSourceDto } from './review-campaign-source.dto';
import { UpdateCampaignDto } from './update-campaign.dto';

describe('DTOs de edição e revisão de campanhas', () => {
  it.each(['title', 'type', 'agency', 'targetAudience', 'requirements', 'location'])('recusa %s com apenas espaços', async (field) => {
    const dto = plainToInstance(UpdateCampaignDto, { [field]: '   ' });
    expect(await validate(dto)).not.toHaveLength(0);
  });
  it.each(['title', 'startsAt', 'sourceUrl'])('recusa null em %s na atualização parcial', async (field) => {
    expect(await validate(plainToInstance(UpdateCampaignDto, { [field]: null }))).not.toHaveLength(0);
  });
  it('aceita omissão de campos na edição parcial e normaliza conteúdo informado', async () => {
    const dto = plainToInstance(UpdateCampaignDto, { title: ' Nova campanha ' });
    expect(dto.title).toBe('Nova campanha');
    expect(await validate(dto)).toHaveLength(0);
  });
  it('normaliza strings obrigatórias na criação', () => {
    expect(plainToInstance(CreateCampaignDto, { title: ' Vacinação ' }).title).toBe('Vacinação');
  });
  it.each([
    { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(1001) }, { sourceStatus: 'NOT_CHECKED' },
    { expectedVersion: '1.2' }, { expectedVersion: '-1' }, { expectedVersion: 1 }, { expectedVersion: '' },
  ])('recusa decisão inválida %j', async (change) => {
    const dto = plainToInstance(ReviewCampaignSourceDto, { sourceStatus: 'VALID', expectedVersion: '123', reason: 'Conferência manual', ...change });
    expect(await validate(dto)).not.toHaveLength(0);
  });
  it('aceita justificativa e versão válidas', async () => {
    const dto = plainToInstance(ReviewCampaignSourceDto, { sourceStatus: 'OUTDATED', expectedVersion: '123', reason: ' Página desatualizada ' });
    expect(dto.reason).toBe('Página desatualizada');
    expect(await validate(dto)).toHaveLength(0);
  });
  it('aceita filtro UNREACHABLE e recusa filtro desconhecido', async () => {
    expect(await validate(plainToInstance(ListAdminCampaignsQueryDto, { sourceStatus: 'UNREACHABLE' }))).toHaveLength(0);
    expect(await validate(plainToInstance(ListAdminCampaignsQueryDto, { sourceStatus: 'other' }))).not.toHaveLength(0);
  });
});
