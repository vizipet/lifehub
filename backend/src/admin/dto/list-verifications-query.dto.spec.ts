import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListVerificationsQueryDto } from './list-verifications-query.dto';

describe('ListVerificationsQueryDto', () => {
  it('aplica valores padrão', async () => {
    const dto = plainToInstance(ListVerificationsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual({ page: 1, limit: 20 });
  });

  it('converte paginação válida recebida como texto', async () => {
    const dto = plainToInstance(ListVerificationsQueryDto, { page: '3', limit: '100' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual({ page: 3, limit: 100 });
  });

  it.each([
    { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: 'abc' },
    { limit: '0' }, { limit: '101' }, { limit: '2.5' }, { limit: 'abc' },
  ])('recusa paginação inválida: %j', async (input) => {
    const dto = plainToInstance(ListVerificationsQueryDto, input);
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
