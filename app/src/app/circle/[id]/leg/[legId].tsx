import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react-native';
import { deleteLeg, saveLeg } from '@/lib/data';
import { geocode } from '@/lib/geo';
import { useCircle } from '@/lib/useCircle';
import { addDays, fmtTime, Leg, parseTime, prettyDate, Stop, toISO, WEEKDAY_SHORT } from '@/lib/schedule';
import { Body, Button, Card, Centered, Chip, ErrorNote, Field, Gap, Heading, Screen, Small, Title, Wrap } from '@/components/ui';
import { colors, space } from '@/theme';

type StopDraft = { label: string; time: string; kidIds: string[]; address: string; lat?: number; lng?: number; found?: string };

export default function LegEditor() {
  const { id, legId } = useLocalSearchParams<{ id: string; legId: string }>();
  const isNew = legId === 'new';
  const { circle, members, kids, legs, rotation } = useCircle(id);
  const today = toISO(new Date());

  const [loaded, setLoaded] = useState(isNew);
  const [direction, setDirection] = useState<'AM' | 'PM'>('AM');
  const [oneOff, setOneOff] = useState(false);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [date, setDate] = useState(today);
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [stops, setStops] = useState<StopDraft[]>([{ label: '', time: '', kidIds: [], address: '' }]);
  const [driverMode, setDriverMode] = useState<'rotation' | 'fixed'>('rotation');
  const [fixedUid, setFixedUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load an existing leg once it arrives.
  useEffect(() => {
    if (isNew || loaded) return;
    const leg = legs[legId];
    if (!leg) return;
    setDirection(leg.direction);
    setOneOff(!!leg.date);
    setDays(leg.days);
    setDate(leg.date ?? today);
    setWindowStart(fmtTime(leg.windowStart));
    setWindowEnd(leg.windowEnd ? fmtTime(leg.windowEnd) : '');
    setStops(leg.stops.map((s) => ({ label: s.label, time: fmtTime(s.time), kidIds: s.kidIds, address: s.address ?? '', lat: s.lat, lng: s.lng, found: s.lat !== undefined ? 'Pinned on the map' : undefined })));
    setDriverMode(leg.driverMode);
    setFixedUid(leg.fixedUid ?? null);
    setLoaded(true);
  }, [legs, legId, isNew, loaded, today]);

  if (!circle || !loaded)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );

  const patchStop = (i: number, p: Partial<StopDraft>) => setStops((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const moveStop = (i: number, d: number) =>
    setStops((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  async function findStop(i: number) {
    setFinding(i);
    setError(null);
    try {
      const hit = await geocode(stops[i].address);
      if (hit) patchStop(i, { lat: hit.lat, lng: hit.lng, found: hit.display.split(',').slice(0, 3).join(',') });
      else setError('We could not find that address. Try adding the city and state.');
    } catch {
      setError('The address lookup is not responding. Try again in a moment.');
    }
    setFinding(null);
  }

  async function save() {
    setError(null);
    const start = parseTime(windowStart);
    if (!start) return setError('Enter a start time like 7:40 AM or 2:45 PM.');
    let end = '';
    if (windowEnd.trim()) {
      const e = parseTime(windowEnd);
      if (!e) return setError('The end time needs to look like 8:15 AM.');
      end = e;
    }
    if (!oneOff && days.length === 0) return setError('Pick at least one day of the week.');
    const cleanStops: Stop[] = [];
    for (const s of stops) {
      if (!s.label.trim() && !s.time.trim()) continue;
      const t = parseTime(s.time);
      if (!s.label.trim() || !t) return setError('Each stop needs a name and a time like 7:50 AM.');
      cleanStops.push({ label: s.label.trim(), time: t, kidIds: s.kidIds, ...(s.address.trim() ? { address: s.address.trim() } : {}), ...(s.lat !== undefined && s.lng !== undefined ? { lat: s.lat, lng: s.lng } : {}) });
    }
    if (cleanStops.length === 0) return setError('Add at least one stop.');
    if (driverMode === 'fixed' && !fixedUid) return setError('Choose which parent always drives this ride.');

    const existing = isNew ? null : legs[legId];
    const leg: Leg = {
      direction,
      days: oneOff ? [] : [...days].sort(),
      ...(oneOff ? { date } : {}),
      startDate: existing?.startDate ?? today,
      windowStart: start,
      windowEnd: end,
      stops: cleanStops,
      driverMode,
      ...(driverMode === 'fixed' && fixedUid ? { fixedUid } : {}),
      // New rotating legs start one parent later than the last one, so AM and PM differ.
      rotationOffset: existing?.rotationOffset ?? Object.values(legs).filter((l) => l.driverMode === 'rotation').length,
    };
    setBusy(true);
    try {
      await saveLeg(id, isNew ? null : legId, leg);
      router.back();
    } catch {
      setError('Could not save this ride. Try again in a moment.');
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteLeg(id, legId);
      router.back();
    } catch {
      setError('Could not delete this ride.');
      setBusy(false);
    }
  }

  const nextDays = Array.from({ length: 21 }, (_, i) => addDays(today, i));

  return (
    <Screen back footer={<Button label={isNew ? 'Add ride' : 'Save changes'} onPress={save} loading={busy} />}>
      <Title>{isNew ? 'Add a ride' : 'Edit ride'}</Title>
      <Small>
        {circle.name} · rides are one direction, so a morning dropoff and an afternoon pickup are two rides.
      </Small>

      <Heading>Direction</Heading>
      <Wrap>
        <Chip label="Morning dropoff" on={direction === 'AM'} onPress={() => setDirection('AM')} />
        <Chip label="Afternoon pickup" on={direction === 'PM'} onPress={() => setDirection('PM')} />
      </Wrap>

      <Heading>When</Heading>
      <Wrap>
        <Chip label="Every week" on={!oneOff} onPress={() => setOneOff(false)} />
        <Chip label="One day only" on={oneOff} onPress={() => setOneOff(true)} />
      </Wrap>
      {oneOff ? (
        <View style={{ gap: space.sm }}>
          <Small>{prettyDate(date)}</Small>
          <Wrap>
            {nextDays.map((d) => (
              <Chip small key={d} label={`${WEEKDAY_SHORT[(new Date(d + 'T00:00').getDay() + 6) % 7]} ${Number(d.slice(8))}`} on={date === d} onPress={() => setDate(d)} />
            ))}
          </Wrap>
        </View>
      ) : (
        <Wrap>
          {WEEKDAY_SHORT.map((w, i) => (
            <Chip key={w} label={w} on={days.includes(i + 1)} onPress={() => setDays((d) => (d.includes(i + 1) ? d.filter((x) => x !== i + 1) : [...d, i + 1]))} />
          ))}
        </Wrap>
      )}

      <Field label="Starts around" value={windowStart} onChangeText={setWindowStart} placeholder={direction === 'AM' ? '7:40 AM' : '2:45 PM'} hint={direction === 'AM' ? 'When the driver starts picking kids up.' : 'When school lets out.'} />
      <Field label="Done by (optional)" value={windowEnd} onChangeText={setWindowEnd} placeholder={direction === 'AM' ? '8:15 AM' : '3:30 PM'} />

      <Heading>Stops, in order</Heading>
      <Small>You know the sensible order, so enter it here. Times are your best estimate and become live ETAs on ride day.</Small>
      {stops.map((s, i) => (
        <Card key={i} style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Body style={{ color: '#fff', fontWeight: '800' }}>{i + 1}</Body>
            </View>
            <View style={{ flex: 1 }} />
            <IconBtn label="Move up" disabled={i === 0} onPress={() => moveStop(i, -1)} icon={<ArrowUp size={18} color={colors.ink} />} />
            <IconBtn label="Move down" disabled={i === stops.length - 1} onPress={() => moveStop(i, 1)} icon={<ArrowDown size={18} color={colors.ink} />} />
            <IconBtn label="Remove stop" disabled={stops.length === 1} onPress={() => setStops((x) => x.filter((_, j) => j !== i))} icon={<Trash2 size={18} color={colors.danger} />} />
          </View>
          <Field label="Where" value={s.label} onChangeText={(v) => patchStop(i, { label: v })} placeholder={i === stops.length - 1 && direction === 'AM' ? 'Lincoln Elementary' : 'The Hendersons'} />
          <Field label="Time" value={s.time} onChangeText={(v) => patchStop(i, { time: v })} placeholder="7:50 AM" />
          <Field
            label="Street address (for the map)"
            value={s.address}
            onChangeText={(v) => patchStop(i, { address: v, lat: undefined, lng: undefined, found: undefined })}
            placeholder="123 Maple St, Springfield"
            hint={s.found ? `${s.found}${s.lat !== undefined ? ' ✓' : ''}` : 'Optional. Without it, this stop shows up in the list but not on the map.'}
          />
          {s.address.trim() && s.lat === undefined && (
            <Button variant="secondary" label="Find on map" loading={finding === i} onPress={() => findStop(i)} />
          )}
          {kids.length > 0 && (
            <View style={{ gap: space.sm }}>
              <Body>Kids at this stop</Body>
              <Wrap>
                {kids.map((k) => (
                  <Chip small key={k.id} label={k.name} on={s.kidIds.includes(k.id)} onPress={() => patchStop(i, { kidIds: s.kidIds.includes(k.id) ? s.kidIds.filter((x) => x !== k.id) : [...s.kidIds, k.id] })} />
                ))}
              </Wrap>
            </View>
          )}
        </Card>
      ))}
      <Button variant="secondary" label="Add a stop" icon={<Plus size={20} color={colors.ink} strokeWidth={2.5} />} onPress={() => setStops((s) => [...s, { label: '', time: '', kidIds: [], address: '' }])} />

      <Heading>Who drives</Heading>
      <Wrap>
        <Chip label="Take turns" on={driverMode === 'rotation'} onPress={() => setDriverMode('rotation')} />
        <Chip label="Same parent every time" on={driverMode === 'fixed'} onPress={() => setDriverMode('fixed')} />
      </Wrap>
      {driverMode === 'fixed' ? (
        <Wrap>
          {members.map((m) => (
            <Chip key={m.uid} label={m.name} on={fixedUid === m.uid} onPress={() => setFixedUid(m.uid)} />
          ))}
        </Wrap>
      ) : (
        <Small>Parents rotate in the circle's driving order: {rotation.length} in the rotation now.</Small>
      )}

      <ErrorNote message={error} />
      {!isNew && <Button variant="danger" label="Delete this ride" onPress={remove} disabled={busy} />}
    </Screen>
  );
}

function IconBtn({ label, onPress, disabled, icon }: { label: string; onPress: () => void; disabled: boolean; icon: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunk, opacity: disabled ? 0.35 : 1 }}
    >
      {icon}
    </Pressable>
  );
}
