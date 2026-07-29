const assert = require('assert');
const {
  validateNombre, validateApellidoMaterno, validateAniosExperiencia,
  validateCedula, validateOrcid, validateMotivacion, validateRegisterForm,
} = require('./collaboratorValidation');

assert.strictEqual(validateNombre('Ana', 'El nombre'), null);
assert.strictEqual(validateNombre('', 'El nombre'), 'El nombre es obligatorio');
assert.strictEqual(validateNombre('A', 'El nombre'), 'El nombre debe tener 2-50 letras');

assert.strictEqual(validateApellidoMaterno(''), null);
assert.strictEqual(validateApellidoMaterno('García'), null);
assert.strictEqual(validateApellidoMaterno('G'), 'Apellido materno debe tener 2-50 letras');

assert.strictEqual(validateAniosExperiencia('5'), null);
assert.strictEqual(validateAniosExperiencia('0'), null);
assert.strictEqual(validateAniosExperiencia('100'), null);
assert.strictEqual(validateAniosExperiencia('101'), 'Los años de experiencia deben ser un número entre 0 y 100');
assert.strictEqual(validateAniosExperiencia('-1'), 'Los años de experiencia deben ser un número entre 0 y 100');
assert.strictEqual(validateAniosExperiencia(''), 'Los años de experiencia son obligatorios');
assert.strictEqual(validateAniosExperiencia('abc'), 'Los años de experiencia deben ser un número entre 0 y 100');

assert.strictEqual(validateCedula('1234567'), null);
assert.strictEqual(validateCedula('12345678'), null);
assert.strictEqual(validateCedula(''), 'El número de cédula profesional es obligatorio');
assert.strictEqual(validateCedula('123'), 'Formato de cédula profesional inválido (7-8 dígitos)');

assert.strictEqual(validateOrcid(''), null);
assert.strictEqual(validateOrcid('0000-0002-1825-0097'), null);
assert.strictEqual(validateOrcid('bad-orcid'), 'El ORCID debe tener el formato 0000-0000-0000-0000');

assert.strictEqual(validateMotivacion('x'.repeat(50)), null);
assert.strictEqual(validateMotivacion('short'), 'Cuéntanos tu motivación en al menos 50 caracteres');
assert.strictEqual(validateMotivacion('x'.repeat(501)), 'La motivación no puede exceder 500 caracteres');
assert.strictEqual(validateMotivacion(''), 'La motivación para colaborar es obligatoria');

const validFields = {
  nombre: 'Ana', apellidoPaterno: 'García', apellidoMaterno: '',
  especialidad: 'biologia-marina', gradoAcademico: 'maestria',
  institucion: 'UPQ', aniosExperiencia: '5', numeroCedula: '1234567',
  orcid: '', motivacion: 'x'.repeat(60), termsAccepted: true,
};
assert.strictEqual(validateRegisterForm(validFields), null);

assert.strictEqual(
  validateRegisterForm({ ...validFields, termsAccepted: false }),
  'Debes aceptar los términos para colaboradores científicos'
);

assert.strictEqual(
  validateRegisterForm({ ...validFields, numeroCedula: '123' }),
  'Formato de cédula profesional inválido (7-8 dígitos)'
);

console.log('collaboratorValidation: all assertions passed');
