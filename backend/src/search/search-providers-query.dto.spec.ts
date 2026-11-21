import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchProvidersQueryDto } from './search-providers-query.dto';

describe('Search pagination bounds', () => {
  it('aceita a última página permitida', async () => {
    expect(
      await validate(
        plainToInstance(SearchProvidersQueryDto, { page: '100', limit: '50' }),
      ),
    ).toEqual([]);
  });
  it.each(['101', '2147483648', '9007199254740992', '-1', '1.5'])(
    'recusa página inválida %s',
    async (page) => {
      expect(
        await validate(plainToInstance(SearchProvidersQueryDto, { page })),
      ).not.toEqual([]);
    },
  );
});
