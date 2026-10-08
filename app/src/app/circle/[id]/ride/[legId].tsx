import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { onValue, ref } from 'firebase/database';
import { Car, ChevronLeft, Navigation } from 'lucide-react-native';
import { rtdb } from '@/lib/firebase';
import { acceptSwap, cancelSwap, clearPosition, ensureRealtimeAccess, livePath, patchRun, publishPosition, requestSwap, runKey, sendBroadcast, startRun } from '@/lib/data';
import type { BroadcastType } from '@/lib/social';
import { fetchRoute, fmtDistance, haversine, nearestIndex, pointAt, Route } from '@/lib/geo';
import { initialKids, kidActions, kidIdsOf, KidState, Live, PHASES, phaseOf, primaryLabel } from '@/lib/ride';
import { driverFor, fmtTime, prettyDate, toISO } from '@/lib/schedule';
import { useSession } from '@/lib/session';
import { useCircle } from '@/lib/useCircle';
import Map from '@/components/Map';
import { Avatar, Body, Button, Centered, Chip, Heading, Small, Wrap } from '@/components/ui';
import { SwapCard, UpdateRow } from '@/components/social';
import { colors, font, radius, space } from '@/theme';

const SIM_SPEEDUP = 8; // demo driver moves 8x real speed so a leg takes a minute or two

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const minutesOfDay = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export default function RideDay() {
  const { id, legId, date: dateParam } = useLocalSearchParams<{ id: string; legId: string; date?: string }>();
  const date = dateParam ?? toISO(new Date());
  const key = runKey(legId, date);
  const { uid, profile } = useSession();
  const { circle, members, kids, legs, overrides, days, runs, broadcasts, swaps, rotation, nameOf } = useCircle(id);
  const leg = legs[legId];
  const run = runs[key];

  const [route, setRoute] = useState<Route | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [simulate, setSimulate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lateOpen, setLateOpen] = useState(false);
  const sheetRef = useRef<ScrollView>(null);
  const [, tick] = useState(0);

  // ---- route (only when every stop has been pinned) ----
  const pinned = leg ? leg.stops.every((s) => s.lat !== undefined && s.lng !== undefined) : false;
  const routeKey = leg && pinned ? leg.stops.map((s) => `${s.lat},${s.lng}`).join('|') : '';
  useEffect(() => {
    if (!leg || !pinned || leg.stops.length < 2) return setRoute(null);
    let alive = true;
    fetchRoute(leg.stops.map((s) => ({ lat: s.lat!, lng: s.lng! }))).then((r) => alive && setRoute(r));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  // ---- live position from Realtime Database ----
  const isAdmin = circle?.adminUid === uid;
  useEffect(() => {
    if (!circle) return;
    let off = () => {};
    let alive = true;
    ensureRealtimeAccess(id, circle.inviteCode, !!isAdmin).then(() => {
      if (!alive) return;
      off = onValue(ref(rtdb, livePath(id, key)), (s) => setLive(s.val() as Live | null), () => setLive(null));
    });
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, circle?.inviteCode]);

  // ---- who is driving ----
  const scheduledDriver = leg ? driverFor(legId, leg, date, rotation, overrides, days) : null;
  const driverUid = run ? run.driverUid : scheduledDriver;
  const isDriver = !!uid && driverUid === uid;
  const driver = members.find((m) => m.uid === driverUid);

  // ---- driver broadcasts position (simulated or real GPS) ----
  const runRef = useRef(run);
  runRef.current = run;
  const liveRef = useRef(live);
  liveRef.current = live;
  const active = isDriver && run?.status === 'started' && !!uid;
  useEffect(() => {
    if (!active || !uid || !leg) return;
    if (run!.simulated) {
      if (!route) return;
      const speed = (route.totalDist / route.totalDur) * SIM_SPEEDUP;
      let dist = liveRef.current ? route.cum[nearestIndex(route.coords, liveRef.current)] : 0;
      const step = () => {
        const r = runRef.current;
        if (!r || r.status !== 'started') return;
        const target = route.cum[route.stopIdx[r.stopIndex]];
        if (!r.arrived && dist < target) dist = Math.min(target, dist + speed);
        const p = pointAt(route.coords, route.cum, dist);
        publishPosition(id, key, uid, p.lat, p.lng, true).catch(() => {});
      };
      step();
      const t = setInterval(step, 1000);
      return () => clearInterval(t);
    }
    if (Platform.OS !== 'web' || !navigator.geolocation) return;
    let last = 0;
    const w = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - last < 3000) return;
        last = Date.now();
        publishPosition(id, key, uid, pos.coords.latitude, pos.coords.longitude, false).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000 },
    );
    return () => navigator.geolocation.clearWatch(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, route, run?.simulated, id, key, uid]);

  // Each time the ride moves on, bring the sheet back to the top so the next thing to do is in view.
  useEffect(() => {
    sheetRef.current?.scrollTo({ y: 0, animated: true });
  }, [run?.stopIndex, run?.arrived, run?.status]);

  // refresh the clock-based readouts every 20s
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 20000);
    return () => clearInterval(t);
  }, []);

  if (!circle || !leg)
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );

  const stops = leg.stops;
  const kidIds = kidIdsOf(stops);
  const started = run?.status === 'started';
  const completed = run?.status === 'completed';
  const stopIndex = run?.stopIndex ?? 0;
  const nextStop = stops[Math.min(stopIndex, stops.length - 1)];
  const label = leg.direction === 'AM' ? 'Morning dropoff' : 'Afternoon pickup';

  // ---- distance / ETA to the next stop ----
  const pos = started && live ? { lat: live.lat, lng: live.lng } : null;
  let remaining: number | null = null;
  if (pos && nextStop) {
    // Straight-line distance undercounts a drive, so allow for roads that are not straight.
    const straight = nextStop.lat !== undefined && nextStop.lng !== undefined ? haversine(pos, { lat: nextStop.lat, lng: nextStop.lng }) * 1.4 : null;
    if (route) {
      // The route only runs between stops. A driver who starts somewhere else (the afternoon
      // pickup starts at home, but the route begins at school) is off it or behind it, so
      // measure straight to the stop until they join the route.
      const i = nearestIndex(route.coords, pos);
      const offRoute = haversine(pos, { lat: route.coords[i][0], lng: route.coords[i][1] }) > 250;
      const ahead = route.cum[route.stopIdx[stopIndex]] - route.cum[i];
      remaining = !offRoute && ahead >= -50 ? Math.max(0, ahead) : straight;
    } else remaining = straight;
  }
  const avgSpeed = (route ? route.totalDist / route.totalDur : 9) * (run?.simulated ? SIM_SPEEDUP : 1); // m/s
  const etaSec = remaining !== null ? remaining / avgSpeed : null;
  const etaMs = etaSec !== null ? Date.now() + etaSec * 1000 : null;
  const nearNext = remaining !== null && remaining < 250;
  const phase = phaseOf(run, kidIds, !!pos, nearNext);

  let late: { text: string; bad: boolean } | null = null;
  if (etaMs !== null && !run?.simulated && started && !run?.arrived) {
    const now = new Date(etaMs);
    const diff = now.getHours() * 60 + now.getMinutes() - minutesOfDay(nextStop.time);
    late = diff >= 3 ? { text: `${diff} min late`, bad: true } : diff <= -3 ? { text: `${-diff} min early`, bad: false } : { text: 'On time', bad: false };
  }

  // ---- hero readout ----
  let hero = fmtTime(leg.windowStart);
  let heroSub = `${prettyDate(date)} · scheduled start`;
  if (completed) {
    hero = 'Done';
    heroSub = run?.completedAt ? `Finished at ${clock(run.completedAt)}` : 'This ride is complete';
  } else if (started && run?.arrived) {
    hero = 'Here';
    heroSub = `At ${nextStop.label}`;
  } else if (started && etaSec !== null) {
    hero = nearNext || etaSec < 45 ? 'Now' : `${Math.max(1, Math.round(etaSec / 60))} min`;
    heroSub = nearNext || etaSec < 45 ? `Arriving at ${nextStop.label}` : `to ${nextStop.label}${etaMs ? ` · arriving ${clock(etaMs)}` : ''}`;
  } else if (started) {
    hero = fmtTime(nextStop.time);
    heroSub = `Next stop: ${nextStop.label} (planned)`;
  }

  // ---- actions ----
  const actions = run ? kidActions(leg.direction, stops, run) : {};
  const lastStop = stopIndex === stops.length - 1;

  const legLabel = `${circle.name} — ${leg.direction === 'AM' ? 'AM dropoff' : 'PM pickup'}`;
  const myName = profile?.name ?? 'A parent';
  const announce = (type: BroadcastType, extra: { kidName?: string; stopLabel?: string; minutes?: number } = {}) =>
    uid ? sendBroadcast(id, { type, fromUid: uid, fromName: myName, legId, legLabel, date, ...extra }).catch(() => {}) : Promise.resolve();

  const swap = swaps[key];
  const openSwap = swap?.status === 'open' ? swap : undefined;
  const rideUpdates = broadcasts.filter((b) => b.legId === legId && b.date === date).slice(0, 5);

  async function askForSub() {
    if (!uid) return;
    setBusy(true);
    try {
      await requestSwap(id, key, { legId, date, legLabel, start: leg.windowStart, requesterUid: uid, requesterName: myName }, swap?.status === 'cancelled');
      await announce('swap_requested');
    } finally {
      setBusy(false);
    }
  }
  async function takeSwap() {
    if (!uid) return;
    await acceptSwap(id, key, { uid, name: myName });
    await announce('swap_accepted');
  }
  async function runningLate(minutes: number) {
    setLateOpen(false);
    await announce('running_late', { minutes });
  }

  async function primary() {
    if (!uid) return;
    setBusy(true);
    try {
      if (!run) {
        await startRun(id, key, uid, initialKids(kidIds), simulate && !!route);
        await announce('ride_started');
      } else if (!run.arrived) await patchRun(id, key, { arrived: true });
      else if (lastStop) {
        const patch: Record<string, unknown> = { status: 'completed', completedAt: Date.now() };
        // Morning: anyone still riding gets dropped at the destination.
        if (leg.direction === 'AM') for (const k of kidIds) if (run.kids[k] === 'picked_up') patch[`kids.${k}`] = 'dropped_off';
        await patchRun(id, key, patch);
        await clearPosition(id, key);
        await announce('ride_completed');
      } else await patchRun(id, key, { stopIndex: stopIndex + 1, arrived: false });
    } finally {
      setBusy(false);
    }
  }
  async function confirmKid(kidId: string, to: KidState) {
    await patchRun(id, key, { [`kids.${kidId}`]: to });
    await announce(to === 'picked_up' ? 'picked_up' : 'dropped_off', { kidName: kidName(kidId) });
  }
  // Tell the family at the next stop that we are almost there, once per stop.
  // If the ride has only just started and the driver is already at the first stop (starting from
  // home, say), there is nothing to announce.
  const justStartedAtFirstStop = stopIndex === 0 && !!run?.startedAt && Date.now() - run.startedAt < 60000;
  const shouldAnnounceArriving = isDriver && started && !run?.arrived && nearNext && run?.arrivingStop !== stopIndex && !justStartedAtFirstStop;
  const announceArriving = () => {
    patchRun(id, key, { arrivingStop: stopIndex }).catch(() => {});
    announce('arriving', { stopLabel: nextStop.label });
  };

  const mapStops = stops.flatMap((s, i) =>
    s.lat !== undefined && s.lng !== undefined
      ? [{ lat: s.lat, lng: s.lng, n: i + 1, label: s.label, done: completed || (started && i < stopIndex), current: started && i === stopIndex }]
      : [],
  );
  const kidName = (k: string) => kids.find((x) => x.id === k)?.name ?? 'Child';
  const driverFirst = (driver?.name ?? 'The driver').split(' ')[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ---------- map ---------- */}
      <View style={{ flex: 1, minHeight: 220 }}>
        <Map stops={mapStops} route={route?.coords ?? null} car={started && live ? { lat: live.lat, lng: live.lng } : null} />
        {mapStops.length === 0 && (
          <View style={{ position: 'absolute', left: space.md, right: space.md, top: 72, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md }}>
            <Small>No stop addresses yet, so there is nothing to draw. The organizer can add them when editing this ride.</Small>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/circle/${id}`))}
          style={{ position: 'absolute', top: space.md, left: space.md, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
        >
          <ChevronLeft size={26} color={colors.ink} strokeWidth={2.25} />
        </Pressable>
      </View>

      {shouldAnnounceArriving && <Announcer key={`arr${stopIndex}`} onFire={announceArriving} />}

      {/* ---------- bottom sheet ---------- */}
      <View
        style={{
          maxHeight: '64%',
          backgroundColor: colors.bg,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          marginTop: -24,
          shadowColor: '#000',
          shadowOpacity: 0.14,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          alignItems: 'center',
        }}
      >
        <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginTop: space.sm }} />
        <ScrollView ref={sheetRef} style={{ width: '100%' }} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: space.md, paddingBottom: space.md }} showsVerticalScrollIndicator={false}>
          <View style={{ width: '100%', maxWidth: 560, gap: space.md, paddingTop: space.md }}>
            {/* hero */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Small>
                  {circle.name} · {label}
                </Small>
                <Text style={[font.display, { fontSize: 48, lineHeight: 54, color: colors.ink }]}>{hero}</Text>
                <Body soft>{heroSub}</Body>
              </View>
              {run?.simulated && !completed ? <Pill text="Demo driver" /> : late ? <Pill text={late.text} bad={late.bad} /> : null}
            </View>

            {openSwap && !completed && !started && uid && (
              <SwapCard swap={openSwap} mine={openSwap.requesterUid === uid} onAccept={takeSwap} onCancel={() => cancelSwap(id, key)} showRide={false} />
            )}
            {rideUpdates.length > 0 && (
              <View style={{ gap: space.sm }}>
                {rideUpdates.slice(0, 2).map((b, i) => (
                  <UpdateRow key={`${b.createdAt}_${i}`} b={b} />
                ))}
              </View>
            )}

            {/* ride-state tracker */}
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {PHASES.map((p, i) => (
                  <View key={p} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i <= phase ? colors.accent : colors.line }} />
                ))}
              </View>
              <Small style={{ color: colors.ink, fontWeight: '700' }}>{PHASES[phase]}</Small>
            </View>

            {/* driver card */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.md }}>
              <Avatar name={driver?.name ?? '?'} tone="sun" />
              <View style={{ flex: 1 }}>
                <Heading>{driver ? `${driver.name}${isDriver ? ' (you)' : ''}` : 'No driver assigned'}</Heading>
                {driver?.car ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Car size={14} color={colors.inkSoft} />
                    <Small>{driver.car}</Small>
                  </View>
                ) : (
                  <Small>{isDriver ? 'Add your car from the home screen so kids can spot it' : 'Driving this ride'}</Small>
                )}
              </View>
            </View>

            {/* next stop (driver) */}
            {isDriver && started && !completed && nextStop && (
              <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: space.md, gap: space.sm }}>
                <Small style={{ color: colors.accent }}>NEXT STOP</Small>
                <Heading>
                  {nextStop.label}
                  {remaining !== null && !run?.arrived ? ` · ${fmtDistance(remaining)}` : ''}
                </Heading>
                <Small>Planned {fmtTime(nextStop.time)}</Small>
                {nextStop.lat !== undefined && (
                  <Button
                    variant="secondary"
                    label="Open in Maps"
                    icon={<Navigation size={20} color={colors.ink} strokeWidth={2.25} />}
                    onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${nextStop.lat},${nextStop.lng}`)}
                  />
                )}
              </View>
            )}
            {!isDriver && started && !completed && !run?.arrived && <Body soft>{driverFirst} is heading to {nextStop.label}.</Body>}

            {/* kid checklist */}
            {kidIds.length > 0 && (
              <View style={{ gap: space.sm }}>
                <Heading>Kids on this ride</Heading>
                {kidIds.map((k) => {
                  const st = run?.kids[k] ?? 'waiting';
                  const act = isDriver ? actions[k] : undefined;
                  return (
                    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space.sm, paddingRight: space.md, minHeight: 64 }}>
                      <Avatar name={kidName(k)} size={44} />
                      <View style={{ flex: 1 }}>
                        <Body style={{ fontWeight: '600' }}>{kidName(k)}</Body>
                        <Small>{stops.find((s) => s.kidIds.includes(k))?.label}</Small>
                      </View>
                      {act ? (
                        <Pressable accessibilityRole="button" onPress={() => confirmKid(k, act.to)} style={{ minHeight: 48, minWidth: 120, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={[font.label, { color: '#fff' }]}>{act.label}</Text>
                        </Pressable>
                      ) : (
                        <StatePill state={st} />
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* stops, plan vs reality */}
            <View style={{ gap: space.sm }}>
              <Heading>Stops</Heading>
              {stops.map((s, i) => {
                const done = completed || (started && i < stopIndex);
                const here = started && i === stopIndex;
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: done ? 0.5 : 1 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: here ? colors.accent : done ? colors.ink : colors.sunk }}>
                      <Text style={{ fontWeight: '800', fontSize: 13, color: here || done ? '#fff' : colors.ink }}>{i + 1}</Text>
                    </View>
                    <Body style={{ flex: 1 }}>{s.label}</Body>
                    <Small>{fmtTime(s.time)}</Small>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* ---------- one evolving primary action ---------- */}
        <View style={{ width: '100%', alignItems: 'center', paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ width: '100%', maxWidth: 560, gap: space.sm }}>
            {isDriver && !run && route && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Chip small label="Simulated driver (demo)" on={simulate} onPress={() => setSimulate((s) => !s)} />
                <Small style={{ flex: 1 }}>Try the ride without driving.</Small>
              </View>
            )}
            {lateOpen && !completed && (
              <View style={{ gap: space.sm }}>
                <Small>How late will you be?</Small>
                <Wrap>
                  {[5, 10, 15, 20].map((m) => (
                    <Chip key={m} label={`${m} min`} on={false} onPress={() => runningLate(m)} />
                  ))}
                  <Chip label="Never mind" on={false} onPress={() => setLateOpen(false)} />
                </Wrap>
              </View>
            )}
            {isDriver && !completed && (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {!lateOpen && (
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" label="Running late" onPress={() => setLateOpen(true)} />
                  </View>
                )}
                {!run && !openSwap && (
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" label="Need a sub" onPress={askForSub} disabled={busy} />
                  </View>
                )}
                {!run && openSwap && openSwap.requesterUid === uid && (
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" label="Cancel sub request" onPress={() => cancelSwap(id, key)} />
                  </View>
                )}
              </View>
            )}
            {isDriver && !completed ? (
              <Button label={primaryLabel(run, stops)} onPress={primary} loading={busy} />
            ) : completed ? (
              <Body soft style={{ textAlign: 'center' }}>This ride is finished. Nothing is tracked after it ends.</Body>
            ) : (
              <Body soft style={{ textAlign: 'center' }}>
                {started ? `${driverFirst} confirms each pickup and dropoff here.` : `${driverFirst} has not started yet. You will see the map move once they do.`}
              </Body>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Pill({ text, bad }: { text: string; bad?: boolean }) {
  return (
    <View style={{ backgroundColor: bad ? '#FBE4E2' : colors.okSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={[font.label, { color: bad ? colors.danger : colors.ok }]}>{text}</Text>
    </View>
  );
}

function StatePill({ state }: { state: KidState }) {
  const map = {
    waiting: { text: 'Waiting', bg: colors.sunk, fg: colors.inkSoft },
    picked_up: { text: 'Picked up', bg: colors.accentSoft, fg: colors.accent },
    dropped_off: { text: 'Dropped off', bg: colors.okSoft, fg: colors.ok },
  }[state];
  return (
    <View style={{ backgroundColor: map.bg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text style={[font.label, { color: map.fg }]}>{map.text}</Text>
    </View>
  );
}

// Fires its callback exactly once when mounted. Used to announce "arriving" once per stop.
function Announcer({ onFire }: { onFire: () => void }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    onFire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
