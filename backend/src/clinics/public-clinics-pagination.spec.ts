import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PublicClinicsQueryDto } from './public-clinics-query.dto';
import { PublicClinicsController } from './public-clinics.controller';
import { ClinicsService } from './clinics.service';

describe('Public clinics pagination', () => {
  it('defaults to page 1 and 20 items', async () => {
    const dto = plainToInstance(PublicClinicsQueryDto, {});
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({ page: 1, limit: 20 });
  });

  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: 'abc' },
    { page: '1000001' },
    { limit: '0' },
    { limit: '51' },
    { limit: '' },
    { limit: ['2', '3'] },
  ])('rejects invalid pagination %j', async (query) => {
    expect(
      (await validate(plainToInstance(PublicClinicsQueryDto, query))).length,
    ).toBeGreaterThan(0);
  });

  it.each([0, 2, 3])(
    'returns bounded results and accurate hasNextPage for %i rows',
    async (count) => {
      const rows = Array.from({ length: count }, (_, i) => ({ id: String(i) }));
      const listPublic = jest.fn().mockResolvedValue(rows);
      const controller = new PublicClinicsController({
        listPublic,
      } as unknown as ClinicsService);
      const query = plainToInstance(PublicClinicsQueryDto, {
        page: '2',
        limit: '2',
      });
      expect(await validate(query)).toEqual([]);
      expect(await controller.listPublic(query)).toEqual({
        data: rows.slice(0, 2),
        meta: { page: 2, limit: 2, hasNextPage: count > 2 },
      });
      expect(listPublic).toHaveBeenCalledWith(2, 2);
    },
  );
});
