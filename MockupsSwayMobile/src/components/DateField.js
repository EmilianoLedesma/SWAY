import { useState } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '../theme/colors';

const pad = (n) => String(n).padStart(2, '0');

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseValue(value, mode) {
  if (!value) return new Date();
  if (mode === 'time') {
    const [h, m] = value.split(':').map(Number);
    const d = new Date();
    if (!Number.isNaN(h)) d.setHours(h, m || 0, 0, 0);
    return d;
  }
  // date or datetime: leading "YYYY-MM-DD" is always parseable directly
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

// Campo de fecha/hora que reemplaza TextInput libre por el picker nativo,
// evitando formatos invalidos que el backend no puede parsear.
export default function DateField({
  label,
  value,
  onChange,
  mode = 'date', // 'date' | 'time' | 'datetime'
  required,
  placeholder,
  style,
  labelStyle,
  textStyle,
  maximumDate,
}) {
  const [stage, setStage] = useState(null); // null | 'date' | 'time'

  const open = () => setStage(mode === 'time' ? 'time' : 'date');

  const handlePicked = (event, selected) => {
    const finishing = stage;
    setStage(null);
    if (event.type === 'dismissed' || !selected) return;

    if (mode === 'date') {
      onChange(formatDate(selected));
    } else if (mode === 'time') {
      onChange(formatTime(selected));
    } else if (mode === 'datetime') {
      if (finishing === 'date') {
        const base = parseValue(value, mode);
        base.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        onChange(`${formatDate(selected)} ${formatTime(base)}`);
        setStage('time');
      } else {
        const base = parseValue(value, mode);
        base.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        onChange(`${formatDate(base)} ${formatTime(base)}`);
      }
    }
  };

  return (
    <>
      {label ? <Text style={labelStyle}>{label}{required ? ' *' : ''}</Text> : null}
      <TouchableOpacity style={[{ justifyContent: 'center' }, style]} onPress={open}>
        <Text style={[textStyle, !value && { color: colors.text3 }]}>
          {value || placeholder || 'Seleccionar'}
        </Text>
      </TouchableOpacity>
      {stage ? (
        <DateTimePicker
          value={parseValue(value, mode)}
          mode={stage}
          display="default"
          onChange={handlePicked}
          {...(maximumDate ? { maximumDate } : {})}
        />
      ) : null}
    </>
  );
}
