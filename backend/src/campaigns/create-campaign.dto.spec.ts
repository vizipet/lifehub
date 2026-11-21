import { validate } from 'class-validator';
import { CreateCampaignDto } from './create-campaign.dto';

function createValidDto(): CreateCampaignDto {
  const dto = new CreateCampaignDto();

  dto.title = 'Campanha de vacinação antirrábica';
  dto.type = 'VACINATION';
  dto.agency = 'Secretaria Municipal de Saúde';
  dto.targetAudience = 'Cães e gatos';
  dto.requirements = 'Documento do tutor';
  dto.location = 'Centro de Vigilância Ambiental';
  dto.startsAt = '2026-10-10T12:00:00.000Z';
  dto.endsAt = '2026-10-20T21:00:00.000Z';
  dto.sourceUrl = 'https://www.exemplo.gov.br/campanha';

  return dto;
}

describe('CreateCampaignDto', () => {
  it('aceita uma campanha válida', async () => {
    const errors = await validate(createValidDto());

    expect(errors).toHaveLength(0);
  });

  it('recusa título vazio', async () => {
    const dto = createValidDto();
    dto.title = '';

    const errors = await validate(dto);

    expect(
      errors.some(
        (error) =>
          error.property === 'title' &&
          error.constraints?.isNotEmpty !== undefined,
      ),
    ).toBe(true);
  });
it('recusa rascunho incompleto', async () => {
  const dto = createValidDto();

  delete (dto as Partial<CreateCampaignDto>).agency;

  const errors = await validate(dto);

  expect(
    errors.some(
      (error) =>
        error.property === 'agency' &&
        error.constraints?.isNotEmpty !== undefined,
    ),
  ).toBe(true);
});
  it('recusa fonte sem HTTPS', async () => {
    const dto = createValidDto();
    dto.sourceUrl = 'http://www.exemplo.gov.br/campanha';

    const errors = await validate(dto);

    expect(
      errors.some(
        (error) =>
          error.property === 'sourceUrl' &&
          error.constraints?.isUrl !== undefined,
      ),
    ).toBe(true);
  });
it('recusa campanha sem fonte', async () => {
  const dto = createValidDto();

  delete (dto as Partial<CreateCampaignDto>).sourceUrl;

  const errors = await validate(dto);

  expect(
    errors.some(
      (error) =>
        error.property === 'sourceUrl' &&
        error.constraints?.isUrl !== undefined,
    ),
  ).toBe(true);
});
  it('recusa data inicial inválida', async () => {
    const dto = createValidDto();
    dto.startsAt = 'data-invalida';

    const errors = await validate(dto);

    expect(
      errors.some(
        (error) =>
          error.property === 'startsAt' &&
          error.constraints?.isDateString !== undefined,
      ),
    ).toBe(true);
  });
});
