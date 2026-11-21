/**
 * Dados FICTÍCIOS para demonstração local do LifeHub.
 * Nenhum nome, CPF ou CRM aqui pertence a uma pessoa real.
 * As senhas de demonstração estão no README e só existem neste banco local.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import { CpfProtector } from '../src/common/security/cpf';
import { LocalDiskStorageService } from '../src/storage/local-disk-storage.service';
import {
  CURRENT_LEGAL_VERSIONS,
  REQUIRED_AT_SIGNUP,
} from '../src/common/legal/legal-documents';

if (process.env.NODE_ENV === 'production') {
  console.error('O seed de demonstração não pode rodar em produção.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Os serviços do app recebem a configuração pelo ConfigService; aqui basta o process.env.
const config = { get: (key: string) => process.env[key] } as never;
const cpf = new CpfProtector(config);
const storage = new LocalDiskStorageService(config);

export const DEMO_PASSWORD = 'LifeHub2026';

/** Gera um CPF válido (dígitos verificadores corretos) a partir de 9 dígitos. */
function makeCpf(base: string): string {
  const digits = base.split('').map(Number);
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += digits[i] * (length + 1 - i);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join('');
}

/** Horário de Brasília (UTC-3, sem horário de verão desde 2019). */
function brt(day: Date, hour: number, minute = 0): Date {
  return new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour + 3, minute),
  );
}

function brtToday(): Date {
  const now = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * 86_400_000);
}

const SPECIALTIES = [
  ['CLINICA_MEDICA', 'Clínica médica', 'Avaliação geral, prevenção e check-up'],
  ['CARDIOLOGIA', 'Cardiologia', 'Coração e circulação'],
  ['DERMATOLOGIA', 'Dermatologia', 'Pele, cabelos e unhas'],
  ['PEDIATRIA', 'Pediatria', 'Saúde de bebês, crianças e adolescentes'],
  ['GINECOLOGIA', 'Ginecologia e obstetrícia', 'Saúde da mulher e gestação'],
  ['ORTOPEDIA', 'Ortopedia', 'Ossos, músculos e articulações'],
  ['PSIQUIATRIA', 'Psiquiatria', 'Saúde mental'],
  ['OFTALMOLOGIA', 'Oftalmologia', 'Visão e saúde dos olhos'],
  ['ENDOCRINOLOGIA', 'Endocrinologia', 'Hormônios, diabetes e tireoide'],
  ['GERIATRIA', 'Geriatria', 'Saúde da pessoa idosa'],
  ['OTORRINO', 'Otorrinolaringologia', 'Ouvido, nariz e garganta'],
  ['NEUROLOGIA', 'Neurologia', 'Cérebro e sistema nervoso'],
  ['GASTRO', 'Gastroenterologia', 'Sistema digestivo'],
  ['UROLOGIA', 'Urologia', 'Sistema urinário e saúde do homem'],
] as const;

// CNES fictícios (só para a demonstração; não existem no DATASUS).
const CLINICS = [
  { key: 'vida', cnes: '9000001', name: 'Clínica Vida Central', address: 'Av. Boa Viagem, 1200', neighborhood: 'Boa Viagem', lat: -8.1194, lng: -34.8995 },
  { key: 'madalena', cnes: '9000002', name: 'Centro Médico Madalena', address: 'Rua Real da Torre, 450', neighborhood: 'Madalena', lat: -8.0538, lng: -34.9086 },
  { key: 'gracas', cnes: '9000003', name: 'Policlínica das Graças', address: 'Rua das Pernambucanas, 300', neighborhood: 'Graças', lat: -8.0476, lng: -34.8995 },
  { key: 'casaforte', cnes: '9000004', name: 'Clínica Casa Forte', address: 'Praça de Casa Forte, 88', neighborhood: 'Casa Forte', lat: -8.0322, lng: -34.9196 },
] as const;

type DoctorSeed = {
  name: string; email: string; cpfBase: string; birth: string; crm: string;
  specialty: string; clinic: (typeof CLINICS)[number]['key']; bio: string;
  priceCents: number; duration: number; tele: boolean;
};

const DOCTORS: DoctorSeed[] = [
  { name: 'Dra. Helena Costa', email: 'helena@lifehub.local', cpfBase: '111444777', birth: '1984-02-10', crm: '123456', specialty: 'CLINICA_MEDICA', clinic: 'vida', bio: 'Atendimento humanizado para prevenção, check-up e acompanhamento da saúde adulta.', priceCents: 18000, duration: 40, tele: true },
  { name: 'Dr. Rafael Melo', email: 'rafael@lifehub.local', cpfBase: '222555888', birth: '1979-07-21', crm: '287104', specialty: 'CLINICA_MEDICA', clinic: 'madalena', bio: 'Clínico geral com foco em doenças crônicas e saúde preventiva.', priceCents: 15000, duration: 30, tele: true },
  { name: 'Dr. André Lima', email: 'andre@lifehub.local', cpfBase: '333666999', birth: '1975-11-03', crm: '198273', specialty: 'CARDIOLOGIA', clinic: 'vida', bio: 'Cardiologista. Avaliação de risco cardiovascular e hipertensão.', priceCents: 25000, duration: 40, tele: false },
  { name: 'Dra. Camila Nunes', email: 'camila@lifehub.local', cpfBase: '444777000', birth: '1988-05-17', crm: '301928', specialty: 'DERMATOLOGIA', clinic: 'gracas', bio: 'Dermatologia clínica: acne, manchas e prevenção do câncer de pele.', priceCents: 22000, duration: 30, tele: true },
  { name: 'Dra. Beatriz Rocha', email: 'beatriz@lifehub.local', cpfBase: '555888111', birth: '1986-09-29', crm: '276541', specialty: 'PEDIATRIA', clinic: 'casaforte', bio: 'Pediatra. Puericultura, vacinação e acompanhamento do crescimento.', priceCents: 20000, duration: 40, tele: true },
  { name: 'Dr. Bruno Martins', email: 'bruno@lifehub.local', cpfBase: '666999222', birth: '1981-01-14', crm: '254310', specialty: 'ORTOPEDIA', clinic: 'madalena', bio: 'Ortopedista. Dores na coluna, joelho e lesões esportivas.', priceCents: 23000, duration: 30, tele: false },
  { name: 'Dra. Laura Reis', email: 'laura@lifehub.local', cpfBase: '777000333', birth: '1983-12-08', crm: '265487', specialty: 'PSIQUIATRIA', clinic: 'gracas', bio: 'Psiquiatra. Ansiedade, depressão e qualidade do sono.', priceCents: 28000, duration: 50, tele: true },
  { name: 'Dr. Paulo Freitas', email: 'paulo@lifehub.local', cpfBase: '888111444', birth: '1977-04-25', crm: '243198', specialty: 'GERIATRIA', clinic: 'casaforte', bio: 'Geriatra. Cuidado integral da pessoa idosa e da família.', priceCents: 21000, duration: 50, tele: false },
];

/** Foto ilustrativa de cada médico (arquivos em frontend/public/assets/photos). */
/** Dá o CNES fictício às clínicas de demonstração que ainda não têm. */
async function applyDemoClinicCnes(): Promise<void> {
  for (const clinic of CLINICS) {
    await prisma.clinic.updateMany({ where: { name: clinic.name, cnes: null }, data: { cnes: clinic.cnes } });
  }
}

/** PDF mínimo de uma linha, só para a demonstração. */
function demoPdf(text: string): Buffer {
  const content = `BT /F1 12 Tf 20 60 Td (${text}) Tj ET`;
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 420 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj ' +
      `4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj ` +
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  );
}

/** Alvará fictício para as clínicas de demonstração que ainda não têm documento. */
async function applyDemoClinicDocuments(): Promise<void> {
  for (const demo of CLINICS) {
    const clinic = await prisma.clinic.findFirst({
      where: { cnes: demo.cnes, documents: { none: {} } },
      select: { id: true, professionalLinks: { select: { professionalId: true }, take: 1 } },
    });
    const uploader = clinic?.professionalLinks[0]?.professionalId;
    if (!clinic || !uploader) continue;
    const pdf = demoPdf(`ALVARA FICTICIO - ${demo.name.normalize('NFD').replace(/[^\x20-\x7e]/g, '')} - CNES ${demo.cnes}`);
    const storagePath = `clinics/${clinic.id}/documents/demo-alvara.pdf`;
    await storage.remove(storagePath);
    await storage.uploadPrivate({ path: storagePath, data: pdf, contentType: 'application/pdf' });
    await prisma.clinicDocument.create({
      data: { clinicId: clinic.id, uploadedById: uploader, originalName: 'alvara-funcionamento.pdf', storagePath, mimeType: 'application/pdf', sizeBytes: pdf.length },
    });
  }
}

async function applyDoctorPhotos(): Promise<void> {
  for (const doctor of DOCTORS) {
    const slug = doctor.email.split('@')[0];
    await prisma.professional.updateMany({
      where: { user: { email: doctor.email } },
      data: { photoUrl: `/assets/photos/medicos/${slug}.jpg` },
    });
  }
}

async function main(): Promise<void> {
  const already = await prisma.user.findUnique({ where: { email: 'admin@lifehub.local' } });
  if (already) {
    await applyDoctorPhotos();
    await applyDemoClinicCnes();
    await applyDemoClinicDocuments();
    console.log('Seed já aplicado anteriormente. Só fotos, CNES e alvarás de demonstração foram atualizados.');
    return;
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const now = new Date();

  // 1. Especialidades
  const specialtyIds: Record<string, string> = {};
  for (const [code, name, description] of SPECIALTIES) {
    const row = await prisma.specialty.create({ data: { code, name, description } });
    specialtyIds[code] = row.id;
  }

  // Conta com titular, aceites legais e preferências (mesmo fluxo do cadastro).
  async function createAccount(input: {
    name: string; email: string; cpfBase: string; birth: string;
    role: 'PATIENT' | 'PROFESSIONAL' | 'ADMIN'; phone?: string;
  }) {
    const protectedCpf = cpf.protect(makeCpf(input.cpfBase));
    const birthDate = new Date(`${input.birth}T00:00:00Z`);
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? '81999990000',
        birthDate,
        ...protectedCpf,
        passwordHash,
        role: input.role,
      },
    });
    await prisma.patient.create({
      data: { holderId: user.id, relationship: 'SELF', name: user.name, birthDate, ...protectedCpf },
    });
    await prisma.legalAcceptance.createMany({
      data: REQUIRED_AT_SIGNUP.map((documentType) => ({
        userId: user.id,
        documentType,
        version: CURRENT_LEGAL_VERSIONS[documentType],
      })),
    });
    await prisma.notificationPreference.create({ data: { userId: user.id } });
    return user;
  }

  // 2. Administrador
  const admin = await createAccount({
    name: 'Administração LifeHub', email: 'admin@lifehub.local', cpfBase: '123123123', birth: '1990-01-01', role: 'ADMIN',
  });

  // 3. Paciente com dependentes
  const mariana = await createAccount({
    name: 'Mariana Costa', email: 'mariana@lifehub.local', cpfBase: '529982247', birth: '1997-04-12', role: 'PATIENT', phone: '81988887777',
  });
  const marianaSelf = await prisma.patient.findFirstOrThrow({ where: { holderId: mariana.id, relationship: 'SELF' } });
  const lucas = await prisma.patient.create({
    data: {
      holderId: mariana.id, relationship: 'CHILD', name: 'Lucas Costa', birthDate: new Date('2018-03-02T00:00:00Z'),
      sex: 'MALE', guardianConsentAt: now, ...cpf.protect(makeCpf('987654321')),
    },
  });
  await prisma.patient.create({
    data: {
      holderId: mariana.id, relationship: 'PARENT', name: 'Antônio Costa', birthDate: new Date('1959-08-19T00:00:00Z'),
      sex: 'MALE', guardianConsentAt: now,
    },
  });
  await prisma.patient.update({ where: { id: marianaSelf.id }, data: { sex: 'FEMALE' } });

  // 4. Clínicas
  const clinicIds: Record<string, string> = {};
  for (const clinic of CLINICS) {
    const row = await prisma.clinic.create({
      data: {
        cnes: clinic.cnes, name: clinic.name, address: clinic.address, city: 'Recife', neighborhood: clinic.neighborhood,
        latitude: clinic.lat, longitude: clinic.lng, verificationStatus: 'APPROVED',
      },
    });
    clinicIds[clinic.key] = row.id;
  }

  // 5. Médicos aprovados, serviços e horários
  const today = brtToday();
  const doctorRecords: { professionalId: string; clinicId: string; serviceId: string; teleId?: string; name: string; seed: DoctorSeed }[] = [];

  for (const doctor of DOCTORS) {
    const user = await createAccount({ name: doctor.name, email: doctor.email, cpfBase: doctor.cpfBase, birth: doctor.birth, role: 'PROFESSIONAL' });
    const professional = await prisma.professional.create({
      data: {
        userId: user.id, crm: doctor.crm, crmState: 'PE', specialtyId: specialtyIds[doctor.specialty],
        bio: doctor.bio, verificationStatus: 'APPROVED', verificationSubmittedAt: addDays(now, -20),
      },
    });
    const clinicId = clinicIds[doctor.clinic];
    await prisma.clinicProfessional.create({ data: { clinicId, professionalId: professional.id } });
    await prisma.clinic.updateMany({
      where: { id: clinicId, technicalResponsibleProfessionalId: null },
      data: { technicalResponsibleProfessionalId: professional.id },
    });

    const service = await prisma.service.create({
      data: {
        clinicId, name: 'Consulta', description: 'Consulta presencial com avaliação completa.',
        modality: 'IN_PERSON', durationMinutes: doctor.duration, priceCents: doctor.priceCents,
        professionalLinks: { create: { professionalId: professional.id } },
      },
    });
    let teleId: string | undefined;
    if (doctor.tele) {
      const tele = await prisma.service.create({
        data: {
          clinicId, name: 'Teleconsulta', description: 'Atendimento por vídeo.',
          modality: 'REMOTE', durationMinutes: 30, priceCents: Math.round(doctor.priceCents * 0.8),
          professionalLinks: { create: { professionalId: professional.id } },
        },
      });
      teleId = tele.id;
    }
    doctorRecords.push({ professionalId: professional.id, clinicId, serviceId: service.id, teleId, name: doctor.name, seed: doctor });
  }

  // Horários: hoje + 13 dias úteis, manhã e tarde. Teleconsultas no fim da tarde.
  const slots: { clinicId: string; professionalId: string; serviceId: string; startsAt: Date; endsAt: Date }[] = [];
  for (const record of doctorRecords) {
    for (let offset = 0; offset < 14; offset += 1) {
      const day = addDays(today, offset);
      const weekday = day.getUTCDay();
      if (weekday === 0) continue; // domingo sem atendimento
      const periods: [number, number][] = weekday === 6 ? [[8, 12]] : [[8, 12], [14, 17]];
      for (const [startHour, endHour] of periods) {
        let cursor = brt(day, startHour);
        const end = brt(day, endHour);
        while (cursor.getTime() + record.seed.duration * 60_000 <= end.getTime()) {
          const finish = new Date(cursor.getTime() + record.seed.duration * 60_000);
          if (cursor > now) {
            slots.push({ clinicId: record.clinicId, professionalId: record.professionalId, serviceId: record.serviceId, startsAt: cursor, endsAt: finish });
          }
          cursor = finish;
        }
      }
      if (record.teleId && weekday !== 6) {
        for (const [hour, minute] of [[17, 30], [18, 0], [18, 30], [19, 0]]) {
          const start = brt(day, hour, minute);
          if (start > now) {
            slots.push({ clinicId: record.clinicId, professionalId: record.professionalId, serviceId: record.teleId, startsAt: start, endsAt: new Date(start.getTime() + 30 * 60_000) });
          }
        }
      }
    }
  }
  await prisma.availabilitySlot.createMany({ data: slots });

  await applyDoctorPhotos();

  // 6. Consultas da Mariana: uma futura, uma concluída e uma cancelada.
  const helena = doctorRecords[0];
  const pediatra = doctorRecords.find((record) => record.seed.specialty === 'PEDIATRIA')!;
  async function book(record: typeof helena, patientId: string, status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED_BY_PATIENT', when?: Date) {
    let slot;
    if (when) {
      slot = await prisma.availabilitySlot.create({
        data: {
          clinicId: record.clinicId, professionalId: record.professionalId, serviceId: record.serviceId,
          startsAt: when, endsAt: new Date(when.getTime() + record.seed.duration * 60_000),
          status: status === 'CANCELLED_BY_PATIENT' ? 'AVAILABLE' : 'BOOKED',
        },
      });
    } else {
      slot = await prisma.availabilitySlot.findFirstOrThrow({
        where: { professionalId: record.professionalId, serviceId: record.serviceId, status: 'AVAILABLE', startsAt: { gt: addDays(now, 2) } },
        orderBy: { startsAt: 'asc' },
      });
      await prisma.availabilitySlot.update({ where: { id: slot.id }, data: { status: 'BOOKED' } });
    }
    const clinic = CLINICS.find((item) => item.key === record.seed.clinic)!;
    await prisma.appointment.create({
      data: {
        holderId: mariana.id, patientId, serviceId: record.serviceId, professionalId: record.professionalId,
        clinicId: record.clinicId, slotId: slot.id, status,
        cancelledAt: status === 'CANCELLED_BY_PATIENT' ? addDays(when ?? now, -1) : null,
        cancellationReason: status === 'CANCELLED_BY_PATIENT' ? 'Não poderei comparecer.' : null,
        serviceNameSnapshot: 'Consulta', serviceDurationMinutesSnapshot: record.seed.duration,
        serviceModalitySnapshot: 'IN_PERSON', servicePriceCentsSnapshot: record.seed.priceCents,
        professionalNameSnapshot: record.name, clinicNameSnapshot: clinic.name,
        clinicAddressSnapshot: `${clinic.address}, ${clinic.neighborhood}, Recife`,
      },
    });
  }
  await book(helena, marianaSelf.id, 'CONFIRMED');
  await book(pediatra, lucas.id, 'COMPLETED', brt(addDays(today, -30), 9));
  await book(helena, marianaSelf.id, 'CANCELLED_BY_PATIENT', brt(addDays(today, -60), 10));

  // 7. Médico aguardando aprovação do administrador (com documento criptografado).
  const pendingUser = await createAccount({ name: 'Dr. Carlos Mendes', email: 'carlos@lifehub.local', cpfBase: '999222555', birth: '1985-06-30', role: 'PROFESSIONAL' });
  const pending = await prisma.professional.create({
    data: {
      userId: pendingUser.id, crm: '310045', crmState: 'PE', specialtyId: specialtyIds.CARDIOLOGIA,
      bio: 'Cardiologista recém-cadastrado.', verificationStatus: 'PENDING', verificationSubmittedAt: addDays(now, -2),
    },
  });
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 120]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj ' +
      '4 0 obj<</Length 66>>stream\nBT /F1 14 Tf 20 60 Td (DOCUMENTO FICTICIO - CRM 310045/PE) Tj ET\nendstream endobj ' +
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  );
  const documentPath = `professionals/${pending.id}/verification/demo-crm.pdf`;
  await storage.remove(documentPath);
  await storage.uploadPrivate({ path: documentPath, data: pdf, contentType: 'application/pdf' });
  await prisma.verificationDocument.create({
    data: { professionalId: pending.id, originalName: 'carteira-crm.pdf', storagePath: documentPath, mimeType: 'application/pdf', sizeBytes: pdf.length },
  });

  await applyDemoClinicDocuments();

  // 8. Campanhas de saúde
  const campaigns = [
    { title: 'Vacinação contra a influenza', type: 'VACINACAO', agency: 'Secretaria de Saúde do Recife', targetAudience: 'Idosos, crianças de 6 meses a 5 anos, gestantes e demais grupos prioritários.', requirements: 'Documento com foto e cartão de vacinação.', location: 'Unidades de saúde da família e policlínicas do Recife', startsAt: addDays(now, -10), endsAt: addDays(now, 25), status: 'PUBLISHED' as const },
    { title: 'Novembro Azul: saúde do homem', type: 'PREVENCAO', agency: 'Ministério da Saúde', targetAudience: 'Homens, com atenção especial a partir dos 50 anos.', requirements: 'Procure uma unidade de saúde para orientação.', location: 'Rede pública de saúde', startsAt: addDays(now, -19), endsAt: addDays(now, 10), status: 'PUBLISHED' as const },
    { title: 'Dezembro Vermelho: prevenção ao HIV', type: 'PREVENCAO', agency: 'Ministério da Saúde', targetAudience: 'Toda a população.', requirements: 'Testagem gratuita e sigilosa.', location: 'Centros de testagem e aconselhamento', startsAt: addDays(now, 11), endsAt: addDays(now, 41), status: 'DRAFT' as const },
  ];
  for (const campaign of campaigns) {
    await prisma.campaign.create({
      data: {
        ...campaign,
        sourceUrl: 'https://www.gov.br/saude/pt-br',
        ...(campaign.status === 'PUBLISHED' && { verifiedById: admin.id, verifiedAt: addDays(now, -9) }),
      },
    });
  }

  console.log('Seed de demonstração aplicado:');
  console.log(`  ${SPECIALTIES.length} especialidades, ${CLINICS.length} clínicas, ${DOCTORS.length} médicos aprovados, 1 médico pendente`);
  console.log(`  ${slots.length} horários disponíveis nos próximos 14 dias`);
  console.log(`  Senha de todas as contas de demonstração: ${DEMO_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
