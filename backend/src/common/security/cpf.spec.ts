import { formatCpf, isValidCpf, maskCpf, normalizeCpf } from './cpf';
import { testCpf } from './cpf.testing';

describe('CPF', () => {
  it.each(['529.982.247-25', '52998224725', ' 390.533.447-05 '])('aceita CPF válido %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each(['529.982.247-24', '111.111.111-11', '123', '', 'abcdefghijk', '5299822472500'])(
    'recusa CPF inválido %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );

  it('normaliza, formata e mascara', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(maskCpf('25')).toBe('•••.•••.•••-25');
    expect(maskCpf(null)).toBeNull();
  });

  it('protege o CPF: hash estável para login e criptografia diferente a cada gravação', () => {
    const cpf = testCpf();
    const a = cpf.protect('529.982.247-25');
    const b = cpf.protect('52998224725');

    expect(a.cpfHash).toBe(b.cpfHash);
    expect(a.cpfHash).toBe(cpf.hash('52998224725'));
    expect(a.cpfEncrypted).not.toBe(b.cpfEncrypted);
    expect(a.cpfEncrypted).not.toContain('52998224725');
    expect(a.cpfLast2).toBe('25');
    expect(cpf.reveal(a.cpfEncrypted)).toBe('52998224725');
  });

  it('detecta CPF criptografado adulterado', () => {
    const cpf = testCpf();
    const { cpfEncrypted } = cpf.protect('52998224725');
    const tampered = cpfEncrypted.slice(0, -2) + (cpfEncrypted.endsWith('00') ? '11' : '00');
    expect(() => cpf.reveal(tampered)).toThrow();
  });
});
