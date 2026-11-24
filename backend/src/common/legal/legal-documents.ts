import { LegalDocumentType } from '../../generated/prisma/enums';

/**
 * Versões vigentes dos documentos legais. Quando um texto mudar no frontend,
 * aumente a versão aqui: o aceite antigo deixa de valer para novos cadastros.
 */
export const CURRENT_LEGAL_VERSIONS: Record<LegalDocumentType, string> = {
  [LegalDocumentType.TERMS_OF_USE]: '1.0',
  [LegalDocumentType.PRIVACY_POLICY]: '1.1',
  [LegalDocumentType.HEALTH_DATA_CONSENT]: '1.0',
};

export const REQUIRED_AT_SIGNUP: LegalDocumentType[] = [
  LegalDocumentType.TERMS_OF_USE,
  LegalDocumentType.PRIVACY_POLICY,
  LegalDocumentType.HEALTH_DATA_CONSENT,
];
