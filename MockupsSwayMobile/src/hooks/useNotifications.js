import { useState, useEffect, useMemo } from 'react';
import { getAvistamientosMine, getEventos } from '../api/client';
import { useGamification } from '../context/GamificationContext';

const relativeDate = (date) => {
  const d = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 86400000));
  if (d < 1) return 'hoy';
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  const w = Math.round(d / 7);
  return `hace ${w} ${w === 1 ? 'semana' : 'semanas'}`;
};

// 'YYYY-MM-DD' string comparison instead of Date objects — new Date('YYYY-MM-DD')
// parses as UTC midnight, which in MX time (UTC-6) already reads as "yesterday"
// past ~18:00 local, dropping same-day events out of "upcoming".
function todayLocalStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function useNotifications() {
  const { badges } = useGamification();
  const [activityNotifs, setActivityNotifs] = useState([]);

  useEffect(() => {
    let active = true;
    Promise.all([getAvistamientosMine(), getEventos()]).then(([avistamientosData, eventosData]) => {
      if (!active) return;

      const avistamientos = avistamientosData?.success
        ? (avistamientosData.avistamientos || [])
            .slice(0, 10)
            .map((a) => ({
              id: `avistamiento-${a.id}`,
              type: 'sighting',
              icon: 'binoculars',
              title: 'Avistamiento verificado',
              body: `Tu avistamiento de ${a.especie_nombre} ha sido verificado.${a.notas ? ` ${a.notas}` : ''}`,
              time: relativeDate(a.fecha),
              date: a.fecha,
              read: false,
            }))
        : [];

      const eventos = eventosData?.success
        ? (eventosData.eventos || [])
            .filter((e) => e.fecha_evento && e.fecha_evento.slice(0, 10) >= todayLocalStr())
            .slice(0, 5)
            .map((e) => ({
              id: `evento-${e.id}`,
              type: 'event',
              icon: 'calendar',
              title: `Evento próximo: ${e.titulo}`,
              body: `Se acerca ${e.titulo}${e.hora_inicio ? ` a las ${e.hora_inicio.slice(0, 5)}` : ''}. ¡No te lo pierdas!`,
              time: relativeDate(e.fecha_evento),
              date: e.fecha_evento,
              read: false,
            }))
        : [];

      setActivityNotifs(
        [...avistamientos, ...eventos].sort((a, b) => new Date(b.date) - new Date(a.date))
      );
    });
    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => {
    const badgeNotifs = badges
      .filter((b) => b.unlocked)
      .map((b) => ({
        id: `badge-${b.label}`,
        type: 'badge',
        icon: 'trophy',
        title: 'Nuevo logro desbloqueado',
        body: `Has obtenido la insignia "${b.label}".`,
        time: 'reciente',
        read: false,
      }));
    return [...badgeNotifs, ...activityNotifs];
  }, [badges, activityNotifs]);
}
