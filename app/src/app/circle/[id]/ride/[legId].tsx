import { useEffect, useMemo, useRef, useState } from 'react';
import { colorFor } from '@/lib/palette';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { onValue, ref } from 'firebase/database';
import { Car, ChevronLeft, Navigation } from 'lucide-react-native';
import { rtdb } from '@/lib/firebase';
import { acceptSwap, cancelSwap, clearPosition, reassignDriver, ensureRealtimeAccess, isOrganizer, livePath, patchRun, publishPosition, logRun, requestSwap, runKey, saveOverride, sendBroadcast, startRun } from '@/lib/data';
import { newestFirst, type BroadcastType } from '@/lib/social';
import { fetchRoute, fmtDistance, haversine, nearestIndex, pointAt, Route } from '@/lib/geo';
import { afterConfirm, initialKids, kidActions, kidIdsOf, KidState, Live, PHASES, phaseOf, primaryAction } from '@/lib/ride';
import { driverFor, fmtTime, prettyDate, rideLabel, rideTitle, toISO } from '@/lib/schedule';
import { useSession } from '@/lib/session';
import { gpsDebug } from '@/lib/gpsDebug';
import { useCircle } from '@/lib/useCircle';
import Map from '@/components/Map';
import { Avatar, Body, Button, Card, Centered, Chip, Flash, Heading, Small, Wrap } from '@/components/ui';
import { SwapCard, UpdateRow } from '@/components/social';
import { displayName } from '@/lib/names';
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
  const [assignOpen, setAssignOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [fixKids, setFixKids] = useState<Record<string, KidState>>({});
  const [fixError, setFixError] = useState<string | null>(null);
  const [farArmed, setFarArmed] = useState(false); // first tap when far from the stop only arms the button
  const sheetRef = useRef<ScrollView>(null);
  const [flash, setFlash] = useState({ text: '', id: 0 }); // a brief confirmation over the map
  const [bigMap, setBigMap] = useState(false); // fold the sheet away so the map fills the screen
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
    // Real location sharing lives in LocationSharer (mounted app-wide), so it keeps going if the
    // driver leaves this screen. Only the demo driver runs here.
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, route, run?.simulated, id, key, uid]);

  useEffect(() => setFarArmed(false), [run?.stopIndex]);

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
  const label = rideTitle(leg);

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
  const kidName = (k: string) => kids.find((x) => x.id === k)?.name ?? 'Child';
  const actions = run ? kidActions(leg.direction, stops, run) : {};
  const lastStop = stopIndex === stops.length - 1;
  const prim = primaryAction(run, stops, actions, kidName);

  const legLabel = rideLabel(circle.name, leg);
  const myName = profile?.name ?? 'A parent';
  const announce = (type: BroadcastType, extra: { kidName?: string; stopLabel?: string; minutes?: number } = {}) =>
    uid ? sendBroadcast(id, { type, fromUid: uid, fromName: myName, legId, legLabel, date, ...extra }).catch(() => {}) : Promise.resolve();

  const swap = swaps[key];
  const openSwap = swap?.status === 'open' ? swap : undefined;
  const rideUpdates = broadcasts.filter((b) => b.legId === legId && b.date === date).sort(newestFirst).slice(0, 1);

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
  // Organizers can pick any parent as this day's driver until the ride starts. Choosing the normal
  // driver again clears the change.
  const canAssign = !!circle && isOrganizer(circle, uid) && !run && date >= toISO(new Date());
  const normalDriver = driverFor(legId, leg, date, rotation, { ...overrides, [key]: { ...overrides[key], driverUid: undefined } }, days);
  async function assignDriver(driverUid: string) {
    setBusy(true);
    try {
      await saveOverride(id, key, { ...overrides[key], driverUid: driverUid === normalDriver ? undefined : driverUid });
      setAssignOpen(false);
    } finally {
      setBusy(false);
    }
  }
  // Correcting the record after the fact. The ride's driver (or an organizer) can say what really
  // happened to each child, whether or not the ride was tracked live. Nothing is locked in.
  const todayIso = toISO(new Date());
  const pastUntracked = !run && date < todayIso;
  const canFix = !!circle && !!uid && (run ? run.status === 'completed' || date < todayIso : date < todayIso) && (isDriver || isOrganizer(circle, uid));
  function openFix() {
    setFixError(null);
    setFixKids(Object.fromEntries(kidIds.map((k) => [k, run?.kids[k] === 'absent' ? 'absent' : 'dropped_off'])) as Record<string, KidState>);
    setFixOpen(true);
  }
  async function saveFix() {
    if (!uid) return;
    setBusy(true);
    setFixError(null);
    try {
      if (run) {
        const patch: Record<string, unknown> = { status: 'completed', completedAt: run.completedAt ?? Date.now() };
        for (const [k, v] of Object.entries(fixKids)) patch['kids.' + k] = v;
        await patchRun(id, key, patch);
      } else await logRun(id, key, uid, fixKids, stops.length);
      await clearPosition(id, key);
      setFixOpen(false);
    } catch {
      setFixError("Couldn't save that. Only the driver or an organizer can correct a ride.");
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

  // Confirm one or more children. Once everyone at this stop is dealt with the ride moves on to
  // the next stop by itself, and after the last stop it completes itself: no "I'm here",
  // "Leave" or "Complete" taps needed for the usual case.
  async function confirmKids(updates: Record<string, KidState>) {
    if (!run) return;
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const [k, to] of Object.entries(updates)) patch[`kids.${k}`] = to;
      const next = afterConfirm(leg.direction, stops, run, updates);
      if (next === 'next') {
        patch.stopIndex = stopIndex + 1;
        patch.arrived = false;
      }
      if (next === 'complete') {
        patch.status = 'completed';
        patch.completedAt = Date.now();
      }
      await patchRun(id, key, patch);
      {
        const verb = (to: KidState) => (to === 'picked_up' ? 'picked up' : to === 'absent' ? 'marked absent' : 'dropped off');
        const names = Object.keys(updates).map((k) => displayName(kidName(k), kids.map((x) => x.name)));
        setFlash((f) => ({ text: names.join(' and ') + ' ' + verb(Object.values(updates)[0]), id: f.id + 1 }));
      }
      for (const [k, to] of Object.entries(updates)) await announce(to === 'picked_up' ? 'picked_up' : 'dropped_off', { kidName: kidName(k) });
      if (next === 'complete') {
        await clearPosition(id, key);
        await announce('ride_completed');
      }
    } finally {
      setBusy(false);
    }
  }
  const confirmKid = (kidId: string, to: KidState) => confirmKids({ [kidId]: to });

  async function primary() {
    if (!uid) return;
    if (prim.kind === 'confirm') {
      // Clearly not at the stop yet (more than ~0.4 mi away)? Ask for a second tap before confirming.
      if (remaining !== null && remaining > 600 && !farArmed) return setFarArmed(true);
      return confirmKids(Object.fromEntries(Object.entries(actions).map(([k, a]) => [k, a.to])));
    }
    setBusy(true);
    try {
      if (prim.kind === 'start') {
        await startRun(id, key, uid, initialKids(kidIds), simulate && !!route);
        await announce('ride_started');
      } else if (prim.kind === 'complete') {
        await patchRun(id, key, { status: 'completed', completedAt: Date.now() });
        await clearPosition(id, key);
        await announce('ride_completed');
      } else if (prim.kind === 'leave') await patchRun(id, key, { stopIndex: stopIndex + 1, arrived: false });
    } finally {
      setBusy(false);
    }
  }
  // A child is not coming (sick, staying late): move on without confirming them.
  const skipStop = () => patchRun(id, key, { stopIndex: stopIndex + 1, arrived: false });
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
  const driverFirst = driver ? displayName(driver.name, members.map((m) => m.name)) : 'The driver';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* ---------- map ---------- */}
      <View style={{ flex: 1, minHeight: 220 }}>
        <Map stops={mapStops} route={route?.coords ?? null} car={started && live ? { lat: live.lat, lng: live.lng } : null} routeColor={colorFor(driverUid ?? 'x', driver?.color).fg} carIcon={driver?.icon} />
        {mapStops.length === 0 && (
          <View style={{ position: 'absolute', left: space.md, right: space.md, top: 72, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md }}>
            <Small>{stops.some((x) => x.address && x.lat === undefined) ? "This ride's addresses are saved but could not be placed on the map. An organizer can open the ride and tap Find on map for each stop." : "No map yet: this ride's stops have no addresses. An organizer can add them in the ride's settings."}</Small>
          </View>
        )}
        {flash.id > 0 && (
          <View pointerEvents="none" style={{ position: 'absolute', zIndex: 10, top: space.md + 6, left: 72, right: space.md, alignItems: 'flex-start' }}>
            <Flash text={flash.text} id={flash.id} />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace(`/circle/${id}`))}
          style={{ position: 'absolute', zIndex: 10, top: space.md, left: space.md, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={bigMap ? 'Show ride details' : 'Show a bigger map'}
          onPress={() => setBigMap((v) => !v)}
          style={{ width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 4 }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line }} />
          <Small style={{ color: colors.accent, fontWeight: '700' }}>{bigMap ? 'Show details' : 'Bigger map'}</Small>
        </Pressable>
        {!bigMap && <ScrollView ref={sheetRef} style={{ width: '100%' }} contentContainerStyle={{ alignItems: 'center', paddingHorizontal: space.md, paddingBottom: space.md }} showsVerticalScrollIndicator={false}>
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
              <SwapCard swap={openSwap} names={members.map((m) => m.name)} mine={openSwap.requesterUid === uid} onAccept={takeSwap} onCancel={() => cancelSwap(id, key)} showRide={false} />
            )}
            {rideUpdates.length > 0 && (
              <View style={{ gap: space.sm }}>
                {rideUpdates.map((b, i) => (
                  <UpdateRow key={`${b.createdAt}_${i}`} b={b} names={members.map((m) => m.name)} />
                ))}
              </View>
            )}

            {isDriver && started && !run?.simulated && <SharingBanner />}

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
              <Avatar name={driver?.name ?? '?'} id={driver?.uid} colorKey={driver?.color} />
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
                      <Avatar name={kidName(k)} size={44} id={k} colorKey={kids.find((x) => x.id === k)?.color} />
                      <View style={{ flex: 1 }}>
                        <Body style={{ fontWeight: '600' }}>{kidName(k)}</Body>
                        <Small>{stops.find((s) => s.kidIds.includes(k))?.label}</Small>
                      </View>
                      {act ? (
                        <Pressable accessibilityRole="button" onPress={() => confirmKid(k, act.to)} style={{ minHeight: 48, minWidth: 120, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={[font.label, { color: colors.onInk }]}>{act.label}</Text>
                        </Pressable>
                      ) : (
                        <StatePill state={st} ended={completed} />
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
                      <Text style={{ fontWeight: '800', fontSize: 13, color: here ? colors.onAccent : done ? colors.onInk : colors.ink }}>{i + 1}</Text>
                    </View>
                    <Body style={{ flex: 1 }}>{s.label}</Body>
                    <Small>{fmtTime(s.time)}</Small>
                  </View>
                );
              })}
            </View>

            {!!circle && !!run && isOrganizer(circle, uid) && (
              <View style={{ gap: space.sm }}>
                {!whoOpen ? (
                  <Button variant="secondary" label="Change who drove" onPress={() => setWhoOpen(true)} />
                ) : (
                  <Card style={{ gap: space.sm }}>
                    <Heading>Who drove this one?</Heading>
                    <Small>Use this if the wrong parent started the ride. The record moves to the person you pick.</Small>
                    <Wrap>
                      {members.map((m) => (
                        <Chip
                          key={m.uid}
                          label={m.name}
                          on={run.driverUid === m.uid}
                          onPress={async () => {
                            if (busy || run.driverUid === m.uid) return;
                            setBusy(true);
                            try {
                              await reassignDriver(id, key, m.uid);
                              setWhoOpen(false);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        />
                      ))}
                    </Wrap>
                    <Button variant="ghost" label="Cancel" onPress={() => setWhoOpen(false)} disabled={busy} />
                  </Card>
                )}
              </View>
            )}

            {canFix && (
              <View style={{ gap: space.sm }}>
                {!fixOpen ? (
                  <Button variant="secondary" label={completed ? 'Fix what happened' : 'Log what happened'} onPress={openFix} />
                ) : (
                  <Card style={{ gap: space.md }}>
                    <Heading>{completed ? 'Fix what happened' : 'Log what happened'}</Heading>
                    <Small>Say how this ride really went. It replaces what was recorded.</Small>
                    {kidIds.map((k) => (
                      <View key={k} style={{ gap: space.sm }}>
                        <Body style={{ fontWeight: '600' }}>{kidName(k)}</Body>
                        <Wrap>
                          <Chip label="Rode and arrived" on={fixKids[k] !== 'absent'} onPress={() => setFixKids((f) => ({ ...f, [k]: 'dropped_off' }))} />
                          <Chip label="Didn't ride" on={fixKids[k] === 'absent'} onPress={() => setFixKids((f) => ({ ...f, [k]: 'absent' }))} />
                        </Wrap>
                      </View>
                    ))}
                    {fixError && <Small style={{ color: colors.danger }}>{fixError}</Small>}
                    <Button label="Save" onPress={saveFix} loading={busy} />
                    <Button variant="ghost" label="Cancel" onPress={() => setFixOpen(false)} disabled={busy} />
                  </Card>
                )}
              </View>
            )}
          </View>
        </ScrollView>}

        {/* ---------- one evolving primary action ---------- */}
        <View style={{ width: '100%', alignItems: 'center', paddingHorizontal: space.md, paddingTop: space.sm, paddingBottom: space.md, borderTopWidth: 1, borderTopColor: colors.line }}>
          <View style={{ width: '100%', maxWidth: 560, gap: space.sm }}>
            {isDriver && !run && route && !pastUntracked && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <Chip small label="Practice drive (no GPS)" on={simulate} onPress={() => setSimulate((s) => !s)} />
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
            {!completed && !pastUntracked && (isDriver || canAssign) && (
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                {isDriver && !lateOpen && (
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" label="Running late" onPress={() => setLateOpen(true)} />
                  </View>
                )}
                {isDriver && started && !lastStop && Object.keys(actions).length > 0 && (
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" label="Skip this stop" onPress={skipStop} disabled={busy} />
                  </View>
                )}
                {canAssign && (
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" label={assignOpen ? 'Close' : 'Change driver'} onPress={() => setAssignOpen((o) => !o)} />
                  </View>
                )}
                {isDriver && !canAssign && !run && !openSwap && (
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" label="Need a sub" onPress={askForSub} disabled={busy} />
                  </View>
                )}
                {isDriver && !run && openSwap && openSwap.requesterUid === uid && (
                  <View style={{ flex: 1 }}>
                    <Button variant="secondary" label="Cancel sub request" onPress={() => cancelSwap(id, key)} />
                  </View>
                )}
              </View>
            )}
            {canAssign && assignOpen && (
              <View style={{ gap: space.sm }}>
                <Small>Who drives this one?</Small>
                <Wrap>
                  {members.map((m) => (
                    <Chip key={m.uid} label={m.name} on={driverUid === m.uid} onPress={() => (busy ? undefined : assignDriver(m.uid))} />
                  ))}
                </Wrap>
              </View>
            )}
            {pastUntracked ? (
              <Body soft style={{ textAlign: 'center' }}>This ride was in the past and was not tracked. Use Log what happened above to record it.</Body>
            ) : isDriver && !completed ? (
              <Button label={farArmed && prim.kind === 'confirm' ? `Not there yet. ${prim.label} anyway?` : prim.label} onPress={primary} loading={busy} />
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
    <View style={{ backgroundColor: bad ? colors.dangerSoft : colors.okSoft, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      <Text style={[font.label, { color: bad ? colors.danger : colors.ok }]}>{text}</Text>
    </View>
  );
}

function StatePill({ state, ended }: { state: KidState; ended?: boolean }) {
  // After the ride is over, "waiting" would be misleading: say what we do and do not know.
  const map = ended && state !== 'dropped_off'
    ? { text: state === 'picked_up' ? 'Dropoff not confirmed' : 'Not confirmed', bg: colors.warnBg, fg: colors.warnFg }
    : {
    waiting: { text: 'Waiting', bg: colors.sunk, fg: colors.inkSoft },
    picked_up: { text: 'Picked up', bg: colors.accentSoft, fg: colors.accent },
    dropped_off: { text: 'Dropped off', bg: colors.okSoft, fg: colors.ok },
    absent: { text: "Didn't ride", bg: colors.sunk, fg: colors.inkSoft },
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

// Tells the driver, in plain words, whether the family can see the car. Reads what LocationSharer reports.
function SharingBanner() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);
  const blocked = gpsDebug.geo.startsWith('location blocked') || gpsDebug.geo.startsWith('this browser');
  const failed = gpsDebug.publish.startsWith('FAILED');
  const sending = Date.now() - gpsDebug.lastSentAt < 20000;
  let text = 'Starting to share your location…';
  let bg: string = colors.sunk;
  let fg: string = colors.inkSoft;
  if (blocked) {
    text = 'Your phone is not sharing its location, so the family cannot see the car. Allow location for this site in your browser settings, then reopen the app.';
    bg = colors.warnBg;
    fg = colors.warnFg;
  } else if (failed) {
    text = 'Your location could not be sent. Check your connection. The ride still works.';
    bg = colors.warnBg;
    fg = colors.warnFg;
  } else if (sending) {
    text = 'Sharing your location with the family';
    bg = colors.okSoft;
    fg = colors.ok;
  }
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm + 2 }}>
      <Text style={[font.label, { color: fg }]}>{text}</Text>
    </View>
  );
}
