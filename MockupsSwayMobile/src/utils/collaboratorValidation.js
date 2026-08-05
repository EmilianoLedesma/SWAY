// MockupsSwayMobile/src/utils/collaboratorValidation.js
// Pure validation for the collaborator register form's accreditation fields.
// Mirrors the rules actually enforced by templates/especies.html's collaborator
// modal JS (validateRegisterForm), not its HTML minlength/required attributes,
// several of which are dead markup there.

const NOMBRE_RE = /^[A-Za-zÀ-ÿ\s]{2,50}$/;
const CEDULA_RE = /^\d{7,8}$/;
const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;

function validateNombre(value, label) {
  if (!value || !value.trim()) return `${label} es obligatorio`;
  if (!NOMBRE_RE.test(value.trim())) return `${label} debe tener 2-50 letras`;
  return null;
}

function validateApellidoMaterno(value) {
  if (!value || !value.trim()) return null;
  if (!NOMBRE_RE.test(value.trim())) return 'Apellido materno debe tener 2-50 letras';
  return null;
}

function validateAniosExperiencia(value) {
  if (!value || !value.trim()) return 'Los años de experiencia son obligatorios';
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 0 || n > 100) {
    return 'Los años de experiencia deben ser un número entre 0 y 100';
  }
  return null;
}

function validateCedula(value) {
  if (!value || !value.trim()) return 'El número de cédula profesional es obligatorio';
  if (!CEDULA_RE.test(value.trim())) return 'Formato de cédula profesional inválido (7-8 dígitos)';
  return null;
}

function validateOrcid(value) {
  if (!value || !value.trim()) return null;
  if (!ORCID_RE.test(value.trim())) return 'El ORCID debe tener el formato 0000-0000-0000-0000';
  return null;
}

function formatOrcidInput(raw) {
  let cleaned = raw.toUpperCase().replace(/[^0-9X]/g, '');
  // X is only valid as the 16th character (last digit of the last group) —
  // strip any stray X typed/pasted elsewhere.
  cleaned = cleaned
    .split('')
    .filter((ch, i) => ch !== 'X' || i === 15)
    .join('')
    .slice(0, 16);
  const groups = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    groups.push(cleaned.slice(i, i + 4));
  }
  return groups.join('-');
}

function validateMotivacion(value) {
  const trimmed = (value || '').trim();
  if (!trimmed) return 'La motivación para colaborar es obligatoria';
  if (trimmed.length < 50) return 'Cuéntanos tu motivación en al menos 50 caracteres';
  if (trimmed.length > 500) return 'La motivación no puede exceder 500 caracteres';
  return null;
}

// Returns a { campo: mensaje } object with only the fields that failed.
// Empty object means the form is valid.
function validateRegisterForm(fields) {
  const {
    nombre, apellidoPaterno, apellidoMaterno, especialidad, gradoAcademico,
    institucion, aniosExperiencia, numeroCedula, orcid, motivacion, termsAccepted,
  } = fields;

  const errors = {};

  const nombreError = validateNombre(nombre, 'El nombre');
  if (nombreError) errors.nombre = nombreError;

  const apellidoPaternoError = validateNombre(apellidoPaterno, 'El apellido paterno');
  if (apellidoPaternoError) errors.apellidoPaterno = apellidoPaternoError;

  const apellidoMaternoError = validateApellidoMaterno(apellidoMaterno);
  if (apellidoMaternoError) errors.apellidoMaterno = apellidoMaternoError;

  if (!especialidad) errors.especialidad = 'Selecciona tu especialidad';
  if (!gradoAcademico) errors.gradoAcademico = 'Selecciona tu grado académico';
  if (!institucion) errors.institucion = 'La institución es obligatoria';

  const aniosError = validateAniosExperiencia(aniosExperiencia);
  if (aniosError) errors.aniosExperiencia = aniosError;

  const cedulaError = validateCedula(numeroCedula);
  if (cedulaError) errors.numeroCedula = cedulaError;

  const orcidError = validateOrcid(orcid);
  if (orcidError) errors.orcid = orcidError;

  const motivacionError = validateMotivacion(motivacion);
  if (motivacionError) errors.motivacion = motivacionError;

  if (!termsAccepted) {
    errors.termsAccepted = 'Debes aceptar los términos para colaboradores científicos';
  }

  return errors;
}

module.exports = {
  validateNombre,
  validateApellidoMaterno,
  validateAniosExperiencia,
  validateCedula,
  validateOrcid,
  formatOrcidInput,
  validateMotivacion,
  validateRegisterForm,
};
