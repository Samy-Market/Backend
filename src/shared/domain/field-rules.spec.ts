import { cedulaProblem, isValidCedula } from './field-rules';

describe('Cédula ecuatoriana', () => {
  it('acepta cédulas válidas', () => {
    expect(isValidCedula('1710034065')).toBe(true);
    expect(isValidCedula('0926687856')).toBe(true);
  });

  it('rechaza longitud distinta de 10 y caracteres no numéricos', () => {
    expect(cedulaProblem('092668785')).toContain('10 dígitos');
    expect(cedulaProblem('09266878561')).toContain('10 dígitos');
    expect(cedulaProblem('0926687856001')).toContain('10 dígitos');
    expect(cedulaProblem('09266-7856')).toContain('solo puede tener números');
  });

  it('rechaza provincia inexistente o tercer dígito de persona jurídica', () => {
    expect(cedulaProblem('2526687856')).toContain('provincia');
    expect(cedulaProblem('0026687856')).toContain('provincia');
    expect(cedulaProblem('0966687856')).toContain('tercer dígito');
  });

  it('rechaza un dígito verificador incorrecto', () => {
    expect(cedulaProblem('0926687857')).toContain('dígito verificador');
    expect(cedulaProblem('0912345678')).toContain('dígito verificador');
  });
});
