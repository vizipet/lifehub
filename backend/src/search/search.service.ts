import { BadRequestException, Injectable } from '@nestjs/common';
import { Modality, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SearchProvidersQueryDto } from './search-providers-query.dto';

type SearchProviderRow = {
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  clinicCity: string;
  clinicNeighborhood: string;
  clinicLatitude: number | null;
  clinicLongitude: number | null;
  professionalId: string;
  professionalName: string;
  specialty: string | null;
  crm: string | null;
  crmState: string | null;
  photoUrl: string | null;
  nextAvailableAt: Date;
  nextSlotId: string;
  nextServiceId: string;
  nextServiceName: string;
  nextServiceModality: Modality;
  nextServicePriceCents: number | null;
  nextServiceDurationMinutes: number;
};

type CountRow = {
  total: bigint | number;
};

type AvailabilityWindow = {
  from: Date;
  to: Date | null;
  impossible: boolean;
};

function invalidSearchDate() {
  return new BadRequestException({
    code: 'INVALID_SEARCH_DATE',
    message: 'A data deve representar um dia válido no formato YYYY-MM-DD.',
  });
}

export function resolveRecifeDayUtcRange(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    throw invalidSearchDate();
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1) {
    throw invalidSearchDate();
  }

  const civilDate = new Date(0);
  civilDate.setUTCFullYear(year, month - 1, day);
  civilDate.setUTCHours(0, 0, 0, 0);

  if (
    civilDate.getUTCFullYear() !== year ||
    civilDate.getUTCMonth() !== month - 1 ||
    civilDate.getUTCDate() !== day
  ) {
    throw invalidSearchDate();
  }

  // America/Recife usa UTC-03 no escopo atual do projeto.
  // 00:00 em Recife corresponde a 03:00 UTC.
  const start = new Date(civilDate.getTime());
  start.setUTCHours(3, 0, 0, 0);

  const end = new Date(civilDate.getTime());
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCHours(3, 0, 0, 0);

  return { start, end };
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveAvailabilityWindow(date?: string): AvailabilityWindow {
    const now = new Date();

    if (!date) {
      return {
        from: now,
        to: null,
        impossible: false,
      };
    }

    const { start: dayStart, end: dayEnd } =
      resolveRecifeDayUtcRange(date);

    if (dayEnd <= now) {
      return {
        from: now,
        to: dayEnd,
        impossible: true,
      };
    }

    return {
      from: dayStart > now ? dayStart : now,
      to: dayEnd,
      impossible: false,
    };
  }

  private calculateDistanceKm(
    fromLatitude: number,
    fromLongitude: number,
    toLatitude: number,
    toLongitude: number,
  ) {
    const earthRadiusKm = 6371;

    const toRadians = (value: number) => (value * Math.PI) / 180;

    const latitudeDelta = toRadians(toLatitude - fromLatitude);
    const longitudeDelta = toRadians(toLongitude - fromLongitude);

    const fromLatitudeRadians = toRadians(fromLatitude);
    const toLatitudeRadians = toRadians(toLatitude);

    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(fromLatitudeRadians) *
        Math.cos(toLatitudeRadians) *
        Math.sin(longitudeDelta / 2) ** 2;

    const distance =
      2 *
      earthRadiusKm *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

    return Math.round(distance * 100) / 100;
  }

  async searchProviders(query: SearchProvidersQueryDto) {
    const hasLatitude = query.latitude !== undefined;
    const hasLongitude = query.longitude !== undefined;

    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException({
        code: 'INVALID_SEARCH_COORDINATES',
        message: 'Latitude e longitude devem ser informadas juntas.',
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const availabilityWindow = this.resolveAvailabilityWindow(query.date);

    if (availabilityWindow.impossible) {
      return {
        data: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const searchTerms = (query.q ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const buildEntityTermMatch = (pattern: string) =>
      Prisma.sql`
        (
          unaccent(lower(c.name))
            LIKE unaccent(lower(${pattern}))
          OR unaccent(lower(u.name))
            LIKE unaccent(lower(${pattern}))
          OR unaccent(
            lower(COALESCE(spec.name, ''))
          )
            LIKE unaccent(lower(${pattern}))
          OR unaccent(lower(c.city))
            LIKE unaccent(lower(${pattern}))
          OR unaccent(lower(c.neighborhood))
            LIKE unaccent(lower(${pattern}))
        )
      `;

    const candidateFilters = [
      Prisma.sql`
        c.verification_status =
          'APPROVED'::"VerificationStatus"
      `,
      Prisma.sql`
        p.verification_status =
          'APPROVED'::"VerificationStatus"
      `,
      Prisma.sql`
        u.status = 'ACTIVE'::"UserStatus"
      `,
    ];

    if (query.specialtyId) {
      candidateFilters.push(
        Prisma.sql`p.specialty_id = ${query.specialtyId}::uuid`,
      );
    }

    if (query.city) {
      candidateFilters.push(
        Prisma.sql`
          unaccent(lower(c.city)) =
          unaccent(lower(${query.city}))
        `,
      );
    }

    if (query.neighborhood) {
      candidateFilters.push(
        Prisma.sql`
          unaccent(lower(c.neighborhood)) =
          unaccent(lower(${query.neighborhood}))
        `,
      );
    }

    const activeServiceFilters = [
      Prisma.sql`s.clinic_id = c.id`,
      Prisma.sql`sp.professional_id = p.id`,
      Prisma.sql`s.is_active = true`,
    ];

    if (query.modality) {
      activeServiceFilters.push(
        Prisma.sql`
          s.modality =
          ${query.modality}::"Modality"
        `,
      );
    }

    candidateFilters.push(
      Prisma.sql`
        EXISTS (
          SELECT 1
          FROM services s
          INNER JOIN service_professionals sp
            ON sp.service_id = s.id
          WHERE ${Prisma.join(activeServiceFilters, ' AND ')}
        )
      `,
    );

    for (const term of searchTerms) {
      const pattern = `%${term}%`;
      const entityTermMatch = buildEntityTermMatch(pattern);

      const textServiceFilters = [
        Prisma.sql`sq.clinic_id = c.id`,
        Prisma.sql`spq.professional_id = p.id`,
        Prisma.sql`sq.is_active = true`,
      ];

      if (query.modality) {
        textServiceFilters.push(
          Prisma.sql`
            sq.modality =
            ${query.modality}::"Modality"
          `,
        );
      }

      textServiceFilters.push(
        Prisma.sql`
          unaccent(lower(sq.name))
            LIKE unaccent(lower(${pattern}))
        `,
      );

      candidateFilters.push(
        Prisma.sql`
          (
            ${entityTermMatch}
            OR EXISTS (
              SELECT 1
              FROM services sq
              INNER JOIN service_professionals spq
                ON spq.service_id = sq.id
              WHERE ${Prisma.join(textServiceFilters, ' AND ')}
            )
          )
        `,
      );
    }

    /*
     * Decisão de contrato:
     * a busca pública retorna somente prestadores com pelo menos
     * um horário futuro AVAILABLE compatível com todos os filtros.
     */
    const availabilityServiceFilters = [
      Prisma.sql`sd.clinic_id = c.id`,
      Prisma.sql`sd.is_active = true`,
      Prisma.sql`spd.professional_id = p.id`,
    ];

    if (query.modality) {
      availabilityServiceFilters.push(
        Prisma.sql`
          sd.modality =
          ${query.modality}::"Modality"
        `,
      );
    }

    for (const term of searchTerms) {
      const pattern = `%${term}%`;

      availabilityServiceFilters.push(
        Prisma.sql`
          (
            ${buildEntityTermMatch(pattern)}
            OR unaccent(lower(sd.name))
              LIKE unaccent(lower(${pattern}))
          )
        `,
      );
    }

    const availabilitySlotFilters = [
      Prisma.sql`ad.clinic_id = c.id`,
      Prisma.sql`ad.professional_id = p.id`,
      Prisma.sql`
        ad.status =
          'AVAILABLE'::"AvailabilityStatus"
      `,
      Prisma.sql`
        ad.starts_at >= ${availabilityWindow.from}
      `,
      Prisma.sql`
        ${Prisma.join(availabilityServiceFilters, ' AND ')}
      `,
    ];

    if (availabilityWindow.to) {
      availabilitySlotFilters.push(
        Prisma.sql`
          ad.starts_at < ${availabilityWindow.to}
        `,
      );
    }

    candidateFilters.push(
      Prisma.sql`
        EXISTS (
          SELECT 1
          FROM availability_slots ad
          INNER JOIN services sd
            ON sd.id = ad.service_id
          INNER JOIN service_professionals spd
            ON spd.service_id = sd.id
          WHERE ${Prisma.join(availabilitySlotFilters, ' AND ')}
        )
      `,
    );

    const nextSlotFilters = [
      Prisma.sql`an.clinic_id = c.id`,
      Prisma.sql`an.professional_id = p.id`,
      Prisma.sql`
        an.status =
          'AVAILABLE'::"AvailabilityStatus"
      `,
      Prisma.sql`
        an.starts_at >= ${availabilityWindow.from}
      `,
      Prisma.sql`sn.clinic_id = c.id`,
      Prisma.sql`sn.is_active = true`,
      Prisma.sql`spn.professional_id = p.id`,
    ];

    if (availabilityWindow.to) {
      nextSlotFilters.push(
        Prisma.sql`
          an.starts_at < ${availabilityWindow.to}
        `,
      );
    }

    if (query.modality) {
      nextSlotFilters.push(
        Prisma.sql`
          sn.modality =
          ${query.modality}::"Modality"
        `,
      );
    }

    for (const term of searchTerms) {
      const pattern = `%${term}%`;

      nextSlotFilters.push(
        Prisma.sql`
          (
            ${buildEntityTermMatch(pattern)}
            OR unaccent(lower(sn.name))
              LIKE unaccent(lower(${pattern}))
          )
        `,
      );
    }

    // Padrão do LifeHub: quem atende mais cedo aparece primeiro.
    const orderBy =
      query.sort === 'name'
        ? Prisma.sql`unaccent(lower(u.name)) ASC, p.id ASC, c.id ASC`
        : Prisma.sql`next_slot.starts_at ASC, unaccent(lower(u.name)) ASC, p.id ASC, c.id ASC`;

    const candidateWhere = Prisma.join(candidateFilters, ' AND ');
    const nextSlotWhere = Prisma.join(nextSlotFilters, ' AND ');

    const countQuery = Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM clinic_professionals cp
      INNER JOIN clinics c
        ON c.id = cp.clinic_id
      INNER JOIN professionals p
        ON p.id = cp.professional_id
      INNER JOIN users u
        ON u.id = p.user_id
      LEFT JOIN specialties spec
        ON spec.id = p.specialty_id
      WHERE ${candidateWhere}
    `;

    const dataQuery = Prisma.sql`
      SELECT
        c.id AS "clinicId",
        c.name AS "clinicName",
        c.address AS "clinicAddress",
        c.city AS "clinicCity",
        c.neighborhood AS "clinicNeighborhood",
        c.latitude AS "clinicLatitude",
        c.longitude AS "clinicLongitude",
        p.id AS "professionalId",
        u.name AS "professionalName",
        spec.name AS "specialty",
        p.crm AS "crm",
        p.crm_state AS "crmState",
        CASE
          WHEN p.photo_storage_path IS NOT NULL
            THEN '/public/professionals/' || p.id || '/photo?v=' || (EXTRACT(EPOCH FROM p.photo_updated_at) * 1000)::bigint
          ELSE p.photo_url
        END AS "photoUrl",
        next_slot.starts_at AS "nextAvailableAt",
        next_slot.id AS "nextSlotId",
        next_slot.service_id AS "nextServiceId",
        next_slot.service_name AS "nextServiceName",
        next_slot.service_modality AS "nextServiceModality",
        next_slot.service_price_cents AS "nextServicePriceCents",
        next_slot.service_duration_minutes AS "nextServiceDurationMinutes"
      FROM clinic_professionals cp
      INNER JOIN clinics c
        ON c.id = cp.clinic_id
      INNER JOIN professionals p
        ON p.id = cp.professional_id
      INNER JOIN users u
        ON u.id = p.user_id
      LEFT JOIN specialties spec
        ON spec.id = p.specialty_id
      INNER JOIN LATERAL (
        SELECT
          an.starts_at,
          an.id,
          sn.id AS service_id,
          sn.name AS service_name,
          sn.modality AS service_modality,
          sn.price_cents AS service_price_cents,
          sn.duration_minutes AS service_duration_minutes
        FROM availability_slots an
        INNER JOIN services sn
          ON sn.id = an.service_id
        INNER JOIN service_professionals spn
          ON spn.service_id = sn.id
        WHERE ${nextSlotWhere}
        ORDER BY
          an.starts_at ASC,
          an.id ASC
        LIMIT 1
      ) AS next_slot ON TRUE
      WHERE ${candidateWhere}
      ORDER BY ${orderBy}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const [countRows, rows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<CountRow[]>(countQuery),
      this.prisma.$queryRaw<SearchProviderRow[]>(dataQuery),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    const canCalculateDistance =
      query.latitude !== undefined && query.longitude !== undefined;

    return {
      data: rows.map((row) => {
        const hasClinicCoordinates =
          row.clinicLatitude !== null && row.clinicLongitude !== null;

        const distanceKm =
          canCalculateDistance && hasClinicCoordinates
            ? this.calculateDistanceKm(
                query.latitude!,
                query.longitude!,
                row.clinicLatitude!,
                row.clinicLongitude!,
              )
            : null;

        return {
          clinic: {
            id: row.clinicId,
            name: row.clinicName,
            address: row.clinicAddress,
            city: row.clinicCity,
            neighborhood: row.clinicNeighborhood,
          },
          professional: {
            id: row.professionalId,
            name: row.professionalName,
            specialty: row.specialty,
            crm: row.crm,
            crmState: row.crmState,
            photoUrl: row.photoUrl,
          },
          nextAvailableAt: row.nextAvailableAt,
          nextSlotId: row.nextSlotId,
          nextService: {
            id: row.nextServiceId,
            name: row.nextServiceName,
            modality: row.nextServiceModality,
            priceCents: row.nextServicePriceCents,
            durationMinutes: row.nextServiceDurationMinutes,
          },
          distanceKm,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}