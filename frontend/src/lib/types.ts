export type UserRole = 'PATIENT' | 'PROFESSIONAL' | 'ADMIN';
export type VerificationStatus = 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'SUSPENDED';
export type Modality = 'IN_PERSON' | 'REMOTE';
export type Sex = 'FEMALE' | 'MALE' | 'OTHER' | 'NOT_INFORMED';
export type Relationship = 'SELF' | 'CHILD' | 'SPOUSE' | 'PARENT' | 'SIBLING' | 'GRANDPARENT' | 'OTHER';
export type AppointmentStatus = 'CONFIRMED' | 'CANCELLED_BY_PATIENT' | 'CANCELLED_BY_PROVIDER' | 'CANCELLED_AUTOMATICALLY' | 'COMPLETED';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  cpfMasked: string | null;
  role: UserRole;
  status: string;
  createdAt?: string;
}

export interface Patient {
  id: string;
  relationship: Relationship;
  name: string;
  birthDate: string;
  age: number;
  sex: Sex;
  isHolder: boolean;
  cpfMasked: string | null;
  photoVersion?: string | null;
}

export interface Specialty {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface SearchResult {
  clinic: { id: string; name: string; address: string; city: string; neighborhood: string };
  professional: { id: string; name: string; specialty: string | null; crm: string | null; crmState: string | null; photoUrl: string | null };
  nextAvailableAt: string;
  nextSlotId: string;
  nextService: { id: string; name: string; modality: Modality; priceCents: number | null; durationMinutes: number };
  distanceKm: number | null;
}

export interface ServiceItem {
  id: string;
  clinicId: string;
  name: string;
  description: string | null;
  modality: Modality;
  durationMinutes: number;
  priceCents: number | null;
  isActive?: boolean;
}

export interface PublicProfessional {
  id: string;
  name: string;
  crm: string | null;
  crmState: string | null;
  bio: string | null;
  photoUrl: string | null;
  specialty: { id: string; name: string } | null;
  clinics: { id: string; name: string; address: string; neighborhood: string; city: string; latitude: number | null; longitude: number | null }[];
  services: ServiceItem[];
}

export interface Slot {
  id: string;
  clinicId: string;
  serviceId: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  status?: 'AVAILABLE' | 'BOOKED' | 'BLOCKED';
  service?: { id: string; name: string; modality: Modality };
}

export interface Appointment {
  id: string;
  patientId: string;
  serviceId: string;
  professionalId: string;
  clinicId: string;
  slotId: string;
  status: AppointmentStatus;
  cancelledAt: string | null;
  cancellationReason: string | null;
  serviceNameSnapshot: string;
  serviceDurationMinutesSnapshot: number;
  serviceModalitySnapshot: Modality;
  servicePriceCentsSnapshot: number | null;
  professionalNameSnapshot: string;
  clinicNameSnapshot: string;
  clinicAddressSnapshot: string;
  slot: { startsAt: string; endsAt: string };
  patient: { name: string; relationship: Relationship; age: number; guardianName?: string };
  dependentCheckResult?: 'CONFIRMED' | 'MISMATCH' | null;
  dependentCheckedAt?: string | null;
  photoShared?: boolean;
  attendanceRecordedAt?: string | null;
}

export interface Campaign {
  id: string;
  title: string;
  type: string;
  agency: string;
  targetAudience: string;
  requirements: string;
  location: string;
  startsAt: string;
  endsAt: string;
  sourceUrl: string;
  sourceStatus?: string;
  status?: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  appointmentReminders: boolean;
  campaignUpdates: boolean;
}

export interface ProfessionalProfile {
  id: string;
  crm: string | null;
  crmState: string | null;
  bio: string | null;
  photoUrl: string | null;
  specialtyId: string | null;
  specialty: { id: string; code: string; name: string } | null;
  verificationStatus: VerificationStatus;
  verificationSubmittedAt: string | null;
}

export interface Clinic {
  id: string;
  cnes: string | null;
  cep: string | null;
  name: string;
  address: string;
  city: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: VerificationStatus;
  technicalResponsibleProfessionalId: string | null;
  _count?: { documents: number };
  verificationNote: string | null;
}
