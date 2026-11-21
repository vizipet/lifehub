import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClinicDto } from './create-clinic.dto';
import { UpdateClinicDto } from './update-clinic.dto';

describe('Clinic DTOs', () => {
  it('rejeita campos obrigatórios contendo apenas espaços', async () => {
    const dto = plainToInstance(CreateClinicDto, {
      cnes: '1234567',
      name: '   ',
      address: '   ',
      city: '   ',
      neighborhood: '   ',
    });

    const errors = await validate(dto);

    expect(
      errors.map((error) => error.property).sort(),
    ).toEqual([
      'address',
      'city',
      'name',
      'neighborhood',
    ]);
  });

  it('normaliza espaços externos dos campos da clínica', async () => {
    const dto = plainToInstance(CreateClinicDto, {
      cnes: '123.456-7',
      name: ' Clínica X ',
      address: ' Rua A, 100 ',
      city: ' Recife ',
      neighborhood: ' Boa Viagem ',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({
      cnes: '1234567',
      name: 'Clínica X',
      address: 'Rua A, 100',
      city: 'Recife',
      neighborhood: 'Boa Viagem',
    });
  });

  it('rejeita whitespace no PATCH quando o campo é enviado', async () => {
    const dto = plainToInstance(UpdateClinicDto, {
      city: '   ',
    });

    const errors = await validate(dto);

    expect(
      errors.some((error) => error.property === 'city'),
    ).toBe(true);
  });

  it.each(['123456', '12345678', 'abcdefg', ''])('recusa CNES inválido: "%s"', async (cnes) => {
    const dto = plainToInstance(CreateClinicDto, { cnes, name: 'X', address: 'Y', city: 'Recife', neighborhood: 'Z' });
    expect((await validate(dto)).map((error) => error.property)).toContain('cnes');
  });
});
