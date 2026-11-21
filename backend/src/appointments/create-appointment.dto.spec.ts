import { validate } from 'class-validator';
import { CreateAppointmentDto } from './create-appointment.dto';

describe('CreateAppointmentDto', () => {
  it('aceita IDs UUID válidos', async () => {
    const dto = new CreateAppointmentDto();

    dto.patientId = '550e8400-e29b-41d4-a716-446655440000';
    dto.serviceId = '550e8400-e29b-41d4-a716-446655440001';
    dto.professionalId = '550e8400-e29b-41d4-a716-446655440002';
    dto.clinicId = '550e8400-e29b-41d4-a716-446655440003';
    dto.slotId = '550e8400-e29b-41d4-a716-446655440004';

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('recusa IDs que não sejam UUID', async () => {
    const dto = new CreateAppointmentDto();

    dto.patientId = 'pet-invalido';
    dto.serviceId = 'servico-invalido';
    dto.professionalId = 'profissional-invalido';
    dto.clinicId = 'clinica-invalida';
    dto.slotId = 'slot-invalido';

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'patientId',
        'serviceId',
        'professionalId',
        'clinicId',
        'slotId',
      ]),
    );
  });
});