import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProfessionalDto } from './create-professional.dto';

const SPECIALTY = '550e8400-e29b-41d4-a716-446655440000';

async function errorsFor(input: object) {
  const dto = plainToInstance(CreateProfessionalDto, input);
  return { dto, errors: await validate(dto) };
}

describe('CreateProfessionalDto (somente médicos com CRM)', () => {
  it('aceita CRM com pontuação, normaliza a UF e apara a apresentação', async () => {
    const { dto, errors } = await errorsFor({
      crm: '123.456',
      crmState: ' pe ',
      specialtyId: SPECIALTY,
      bio: '  Clínico geral.  ',
    });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ crm: '123456', crmState: 'PE', bio: 'Clínico geral.' });
  });

  it.each([
    [{ crmState: 'PE', specialtyId: SPECIALTY }, 'crm'],
    [{ crm: '123', crmState: 'PE', specialtyId: SPECIALTY }, 'crm'],
    [{ crm: '123456789', crmState: 'PE', specialtyId: SPECIALTY }, 'crm'],
    [{ crm: '123456', specialtyId: SPECIALTY }, 'crmState'],
    [{ crm: '123456', crmState: 'XX', specialtyId: SPECIALTY }, 'crmState'],
    [{ crm: '123456', crmState: 'PE' }, 'specialtyId'],
    [{ crm: '123456', crmState: 'PE', specialtyId: 'dermatologia' }, 'specialtyId'],
  ])('recusa dados incompletos ou inválidos: %j', async (input, field) => {
    const { errors } = await errorsFor(input);
    expect(errors.map((error) => error.property)).toContain(field);
  });

  it('limita a apresentação a 600 caracteres', async () => {
    const { errors } = await errorsFor({ crm: '123456', crmState: 'PE', specialtyId: SPECIALTY, bio: 'x'.repeat(601) });
    expect(errors.map((error) => error.property)).toEqual(['bio']);
  });
});
