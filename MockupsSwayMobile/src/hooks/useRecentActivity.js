import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getAvistamientosMine, getEventos } from '../api/client';

export default function useRecentActivity(limit = 5) {
  const [recentActivity, setRecentActivity] = useState([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getAvistamientosMine(), getEventos()]).then(([avistamientosData, eventosData]) => {
        if (!active) return;
        const avistamientos = avistamientosData?.success
          ? (avistamientosData.avistamientos || []).map((a) => ({
              key: `avistamiento-${a.id}`,
              text: `Avistamiento de ${a.especie_nombre}${a.notas ? ` — ${a.notas}` : ''}`,
              date: a.fecha,
            }))
          : [];
        const eventos = eventosData?.success
          ? (eventosData.eventos || []).map((e) => ({
              key: `evento-${e.id}`,
              text: `Evento: ${e.titulo}`,
              date: e.fecha_evento,
            }))
          : [];
        setRecentActivity(
          [...avistamientos, ...eventos]
            .filter((item) => item.date)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit)
        );
      });
      return () => {
        active = false;
      };
    }, [limit])
  );

  return recentActivity;
}
