import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { radii } from '../theme/spacing';

// Porta a React Native los mismos gráficos SVG del dashboard de colaboradores en web2
// (web2/src/components/DashboardView.jsx), para mantener paridad visual entre plataformas.

export function DonutChart({ segments, size = 190, thickness = 34 }) {
  const R = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * R;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  if (total === 0) {
    return (
      <View style={[styles.donutEmpty, { width: size, height: size }]}>
        <Text style={styles.emptyText}>Sin datos</Text>
      </View>
    );
  }

  let offset = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segments.map((seg, i) => {
        const dash = (seg.value / total) * circumference;
        const gap = circumference - dash;
        const el = (
          <Circle
            key={i}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            rotation={-90}
            origin={`${cx}, ${cy}`}
          />
        );
        offset += dash;
        return el;
      })}
      <SvgText x={cx} y={cy - 4} textAnchor="middle" fill={colors.text} fontSize="22" fontWeight="700">
        {total}
      </SvgText>
      <SvgText x={cx} y={cy + 16} textAnchor="middle" fill={colors.text2} fontSize="11">
        total
      </SvgText>
    </Svg>
  );
}

export function BarChart({ bars, height = 150 }) {
  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  const barW = 32;
  const gap = 18;
  const totalW = bars.length * (barW + gap) - gap + 40;

  return (
    <Svg width="100%" height={height + 46} viewBox={`0 0 ${totalW} ${height + 46}`} preserveAspectRatio="xMidYMid meet">
      {bars.map((bar, i) => {
        const barH = Math.max((bar.value / maxVal) * height, 4);
        const x = 20 + i * (barW + gap);
        const y = height - barH;
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={y} width={barW} height={barH} rx={5} fill={bar.color} opacity={0.88} />
            <SvgText x={x + barW / 2} y={y - 6} textAnchor="middle" fill={colors.text} fontSize="10" fontWeight="600">
              {bar.value}
            </SvgText>
            <SvgText x={x + barW / 2} y={height + 18} textAnchor="middle" fill={colors.text2} fontSize="9">
              {bar.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export function HBar({ bars }) {
  const maxVal = Math.max(...bars.map((b) => b.value), 1);
  return (
    <View style={{ gap: 10 }}>
      {bars.map((bar, i) => (
        <View key={i}>
          <View style={styles.hbarRow}>
            <Text style={styles.hbarLabel} numberOfLines={1}>
              {bar.label}
            </Text>
            <Text style={styles.hbarValue}>{bar.value}</Text>
          </View>
          <View style={styles.hbarTrack}>
            <View
              style={[
                styles.hbarFill,
                { width: `${(bar.value / maxVal) * 100}%`, backgroundColor: bar.color },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function StatCard({ label, value, color, icon }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '18' }]}>{icon}</View>
      <Text style={[styles.statValue, { color }]}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function ImpactCard({ label, value, unit, color, icon }) {
  return (
    <View style={styles.impactCard}>
      <View style={[styles.impactIcon, { backgroundColor: color + '15' }]}>{icon}</View>
      <Text style={[styles.impactVal, { color }]}>
        {typeof value === 'number' ? value.toLocaleString() : '—'}
      </Text>
      <Text style={styles.impactUnit}>{unit}</Text>
      <Text style={styles.impactLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  donutEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: typography.body,
    fontSize: 13,
    color: colors.text3,
  },
  hbarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  hbarLabel: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
    flex: 1,
    marginRight: 8,
  },
  hbarValue: {
    fontFamily: typography.display,
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  hbarTrack: {
    height: 8,
    backgroundColor: colors.bg,
    borderRadius: radii.r99,
    overflow: 'hidden',
  },
  hbarFill: {
    height: '100%',
    borderRadius: radii.r99,
  },
  statCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    borderTopWidth: 3,
    padding: 14,
    gap: 6,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.r12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: typography.display,
    fontSize: 22,
    fontWeight: typography.weight.bold,
  },
  statLabel: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
  },
  impactCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: colors.surface,
    borderRadius: radii.r16,
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  impactIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.r12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  impactVal: {
    fontFamily: typography.display,
    fontSize: 18,
    fontWeight: typography.weight.bold,
  },
  impactUnit: {
    fontFamily: typography.body,
    fontSize: 11,
    color: colors.text3,
  },
  impactLabel: {
    fontFamily: typography.body,
    fontSize: 12,
    color: colors.text2,
    textAlign: 'center',
  },
});
