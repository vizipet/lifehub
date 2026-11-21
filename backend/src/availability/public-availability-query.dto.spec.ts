import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PublicAvailabilityQueryDto } from './public-availability-query.dto';

describe('PublicAvailabilityQueryDto', () => {
  const valid = {
    serviceId: '22222222-2222-4222-8222-222222222222',
    professionalId: '33333333-3333-4333-8333-333333333333',
  };

  it('exige IDs UUID de serviço e profissional', () => {
    expect(validateSync(plainToInstance(PublicAvailabilityQueryDto, valid))).toHaveLength(0);
    expect(validateSync(plainToInstance(PublicAvailabilityQueryDto, {
      ...valid, professionalId: 'invalid',
    })).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(PublicAvailabilityQueryDto, {
      professionalId: valid.professionalId,
    })).length).toBeGreaterThan(0);
  });

  it('limita a quantidade a 1-50', () => {
    expect(validateSync(plainToInstance(PublicAvailabilityQueryDto, {
      ...valid, limit: '50',
    }))).toHaveLength(0);
    expect(validateSync(plainToInstance(PublicAvailabilityQueryDto, {
      ...valid, limit: '51',
    })).length).toBeGreaterThan(0);
    expect(validateSync(plainToInstance(PublicAvailabilityQueryDto, {
      ...valid, limit: '1.5',
    })).length).toBeGreaterThan(0);
  });
});
