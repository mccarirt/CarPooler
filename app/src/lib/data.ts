import { signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ref, remove, set } from 'firebase/database';
import { auth, db, rtdb } from './firebase';

// A saved place: your home, the school, the club. Saved once on your own profile, so you never retype it.
export type Place = { label: string; address: string; lat: number; lng: number };
export type Profile = { name: string; car: string; color?: string; household?: string[]; places?: Place[] };
export type Membership = { circleName: string; role: 'admin' | 'member' };
export type Member = { uid: string; name: string; car: string; role: 'admin' | 'member'; color?: string };
export type Circle = { name: string; adminUid: string; inviteCode: string; rotation?: string[]; coOrganizerUids?: string[] };
export type Kid = {
  name: string;
  notes: string;
  emergencyName: string;
  emergencyPhone: string;
  ownerUid: string;
  ownerName: string;
  guardianUids?: string[]; // other parents of this child; the owner is always a parent
  color?: string; // avatar color key, see lib/palette
};

export const PUBLIC_URL = 'https://carpooler-app-seven.vercel.app';

// No 0/O/1/I/L so codes survive being read aloud or typed from a text.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeCode(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function ensureSignedIn() {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

export async function saveProfile(name: string, car: string) {
  const uid = await ensureSignedIn();
  await setDoc(doc(db, 'users', uid), { name: name.trim(), car: car.trim() }, { merge: true }); // keeps a chosen color
  return uid;
}

export async function createCircle(name: string, profile: Profile) {
  const uid = await ensureSignedIn();
  const circleRef = doc(collection(db, 'circles'));
  const code = makeCode();
  const circleName = name.trim();
  const batch = writeBatch(db);
  batch.set(circleRef, { name: circleName, adminUid: uid, inviteCode: code, createdAt: serverTimestamp() });
  batch.set(doc(db, 'circles', circleRef.id, 'members', uid), {
    uid,
    name: profile.name,
    car: profile.car,
    ...(profile.color ? { color: profile.color } : {}),
    role: 'admin',
  });
  batch.set(doc(db, 'invites', code), { circleId: circleRef.id, circleName });
  batch.set(doc(db, 'users', uid, 'memberships', circleRef.id), { circleName, role: 'admin' });
  await batch.commit();
  await ensureRealtimeAccess(circleRef.id, code, true).catch(() => {}); // lets members share live location later
  return circleRef.id;
}

export async function getInvite(code: string) {
  const snap = await getDoc(doc(db, 'invites', code));
  return snap.exists() ? (snap.data() as { circleId: string; circleName: string }) : null;
}

export async function joinCircle(code: string, profile: Profile) {
  const uid = await ensureSignedIn();
  const invite = await getInvite(code);
  if (!invite) throw new Error('This invite link is not valid anymore.');
  const batch = writeBatch(db);
  batch.set(doc(db, 'circles', invite.circleId, 'members', uid), {
    uid,
    name: profile.name,
    car: profile.car,
    ...(profile.color ? { color: profile.color } : {}),
    role: 'member',
    code,
  });
  batch.set(doc(db, 'users', uid, 'memberships', invite.circleId), {
    circleName: invite.circleName,
    role: 'member',
  });
  await batch.commit();
  await ensureRealtimeAccess(invite.circleId, code, false).catch(() => {});
  return invite.circleId;
}

export async function addKid(circleId: string, kid: Omit<Kid, 'ownerUid' | 'ownerName'>, owner: Profile) {
  const uid = await ensureSignedIn();
  const ref = await addDoc(collection(db, 'circles', circleId, 'kids'), {
    ...kid,
    ownerUid: uid,
    guardianUids: [...new Set([uid, ...(kid.guardianUids ?? [])])],
    ownerName: owner.name,
  });
  return ref.id;
}

export async function updateKid(circleId: string, kidId: string, kid: Omit<Kid, 'ownerUid' | 'ownerName'>) {
  await updateDoc(doc(db, 'circles', circleId, 'kids', kidId), kid);
}

export async function deleteKid(circleId: string, kidId: string) {
  await deleteDoc(doc(db, 'circles', circleId, 'kids', kidId));
}

// ---------- schedule ----------
import type { DayInfo, Leg, Override } from './schedule';

export async function saveLeg(circleId: string, legId: string | null, leg: Leg) {
  const clean = JSON.parse(JSON.stringify(leg)); // Firestore rejects undefined fields
  if (legId) await setDoc(doc(db, 'circles', circleId, 'legs', legId), clean);
  else await addDoc(collection(db, 'circles', circleId, 'legs'), clean);
}

export async function deleteLeg(circleId: string, legId: string) {
  await deleteDoc(doc(db, 'circles', circleId, 'legs', legId));
}

export async function saveRotation(circleId: string, rotation: string[]) {
  await updateDoc(doc(db, 'circles', circleId), { rotation });
}

export async function saveOverride(circleId: string, key: string, override: Override) {
  const clean = JSON.parse(JSON.stringify(override));
  if (Object.keys(clean).length === 0) await deleteDoc(doc(db, 'circles', circleId, 'instances', key));
  else await setDoc(doc(db, 'circles', circleId, 'instances', key), clean);
}

export async function saveDay(circleId: string, date: string, info: DayInfo) {
  const clean = JSON.parse(JSON.stringify(info));
  if (Object.keys(clean).length === 0) await deleteDoc(doc(db, 'circles', circleId, 'days', date));
  else await setDoc(doc(db, 'circles', circleId, 'days', date), clean);
}


// ---------- ride day ----------
import type { KidState, Run } from './ride';

export const runKey = (legId: string, date: string) => `${legId}_${date}`;

export async function startRun(circleId: string, key: string, driverUid: string, kids: Record<string, KidState>, simulated: boolean) {
  const run: Run = { driverUid, status: 'started', stopIndex: 0, arrived: false, kids, simulated, startedAt: Date.now() };
  await setDoc(doc(db, 'circles', circleId, 'runs', key), run);
}

// `patch` may use dotted keys such as { 'kids.abc123': 'picked_up' }.
export async function patchRun(circleId: string, key: string, patch: Record<string, unknown>) {
  await updateDoc(doc(db, 'circles', circleId, 'runs', key), patch);
}

// ---------- live location (Realtime Database) ----------
// Realtime Database rules can't see Firestore, so membership is mirrored there.
// Safe to call repeatedly; it also backfills circles created before this existed.
export async function ensureRealtimeAccess(circleId: string, inviteCode: string, isAdmin: boolean) {
  const uid = await ensureSignedIn();
  if (isAdmin) {
    await set(ref(rtdb, `circleAdmins/${circleId}`), uid).catch(() => {});
    await set(ref(rtdb, `inviteCodes/${inviteCode}`), circleId).catch(() => {});
  }
  await set(ref(rtdb, `circleMembers/${circleId}/${uid}`), { code: inviteCode }).catch(() => {});
}

export const livePath = (circleId: string, key: string) => `liveLegs/${circleId}/${key}`;

export async function publishPosition(circleId: string, key: string, driverUid: string, lat: number, lng: number, sim: boolean) {
  await set(ref(rtdb, livePath(circleId, key)), { driverUid, lat, lng, ts: Date.now(), sim });
}

export async function clearPosition(circleId: string, key: string) {
  await remove(ref(rtdb, livePath(circleId, key))).catch(() => {});
}


// ---------- broadcasts and swaps ----------
import type { Broadcast, Swap } from './social';

export async function sendBroadcast(circleId: string, b: Omit<Broadcast, 'createdAt'>) {
  await addDoc(collection(db, 'circles', circleId, 'broadcasts'), JSON.parse(JSON.stringify({ ...b, createdAt: Date.now() })));
}

// The swap's document id is the ride-on-a-day key, so a leg can only have one swap per day.
export async function requestSwap(circleId: string, key: string, swap: Omit<Swap, 'status' | 'createdAt'>, reopen: boolean) {
  const ref = doc(db, 'circles', circleId, 'swaps', key);
  if (reopen) await updateDoc(ref, { status: 'open', createdAt: Date.now() });
  else await setDoc(ref, { ...swap, status: 'open', createdAt: Date.now() });
}

export async function cancelSwap(circleId: string, key: string) {
  await updateDoc(doc(db, 'circles', circleId, 'swaps', key), { status: 'cancelled' });
}

// First one to commit wins: the rules only allow 'open' -> 'accepted', so a second accept is refused.
export async function acceptSwap(circleId: string, key: string, me: { uid: string; name: string }) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'circles', circleId, 'swaps', key), {
    status: 'accepted',
    acceptedByUid: me.uid,
    acceptedByName: me.name,
    acceptedAt: Date.now(),
  });
  batch.set(doc(db, 'circles', circleId, 'instances', key), { driverUid: me.uid }, { merge: true });
  await batch.commit();
}

// ---------- people and permissions ----------
// An organizer is whoever started the circle plus anyone they promoted.
export const isOrganizer = (circle: Circle, uid: string | null) =>
  !!uid && (circle.adminUid === uid || !!circle.coOrganizerUids?.includes(uid));

// A child's parents: whoever added them, plus any other parent listed on the profile.
export const guardiansOf = (kid: Pick<Kid, 'ownerUid' | 'guardianUids'>) => [...new Set([kid.ownerUid, ...(kid.guardianUids ?? [])])];

export async function setCoOrganizers(circleId: string, uids: string[]) {
  await updateDoc(doc(db, 'circles', circleId), { coOrganizerUids: uids });
}

// Change your name or car everywhere it is shown: your profile and your card in every circle.
export async function updateProfileEverywhere(name: string, car: string, color?: string) {
  const uid = await ensureSignedIn();
  const clean = { name: name.trim(), car: car.trim(), ...(color ? { color } : {}) };
  await setDoc(doc(db, 'users', uid), clean, { merge: true });
  const circles = await getDocs(collection(db, 'users', uid, 'memberships'));
  const batch = writeBatch(db);
  circles.docs.forEach((c) => batch.update(doc(db, 'circles', c.id, 'members', uid), clean));
  await batch.commit();
}

// Rename a circle. The organizer's own list keeps a copy of the name, so refresh that too; everyone
// else's lists read the name from the circle itself (see useCircleName).
export async function renameCircle(circleId: string, name: string) {
  const uid = await ensureSignedIn();
  const clean = name.trim();
  await updateDoc(doc(db, 'circles', circleId), { name: clean });
  await updateDoc(doc(db, 'users', uid, 'memberships', circleId), { circleName: clean }).catch(() => {});
}

// ---------- household ----------
// A household is the other parents who share your children (a partner, a grandparent who helps).
// Saving it does two things: it remembers the list on your profile, so every NEW child you add is
// shared with them automatically, and it updates every child you are already a parent of. Returns how
// many children changed. Only affects children you are a parent of, and never removes a child's owner.
export async function setHousehold(next: string[], previous: string[]) {
  const uid = await ensureSignedIn();
  await setDoc(doc(db, 'users', uid), { household: next }, { merge: true });
  const added = next.filter((x) => !previous.includes(x));
  const removed = previous.filter((x) => !next.includes(x));
  await syncHousehold(added, removed);
  if (added.length === 0 && removed.length === 0) return 0;

  const circles = await getDocs(collection(db, 'users', uid, 'memberships'));
  const batch = writeBatch(db);
  let changed = 0;
  for (const c of circles.docs) {
    const kids = await getDocs(collection(db, 'circles', c.id, 'kids'));
    for (const k of kids.docs) {
      const kid = k.data() as Kid;
      const current = guardiansOf(kid);
      if (!current.includes(uid)) continue;
      const updated = [...new Set([...current.filter((g) => g === kid.ownerUid || !removed.includes(g)), ...added])];
      if (updated.length === current.length && updated.every((g) => current.includes(g))) continue;
      batch.update(k.ref, { guardianUids: updated });
      changed++;
    }
  }
  if (changed > 0) await batch.commit();
  return changed;
}

// ---------- correcting the record ----------
// Record a ride that was never tracked live (or fix one that was): the person who drove it saves what
// happened to each child. Whoever saves becomes the ride's driver of record.
export async function logRun(circleId: string, key: string, driverUid: string, kids: Record<string, KidState>, stopCount: number) {
  const run: Run = { driverUid, status: 'completed', stopIndex: Math.max(0, stopCount - 1), arrived: false, kids, simulated: false, startedAt: Date.now(), completedAt: Date.now() };
  await setDoc(doc(db, 'circles', circleId, 'runs', key), run);
}

// ---------- saved places ----------
// Kept on your own profile (nobody else can read it). A place is copied onto a ride only when you use it.
export async function savePlaces(places: Place[]) {
  const uid = await ensureSignedIn();
  await setDoc(doc(db, 'users', uid), { places }, { merge: true });
}

// ---------- shared household record ----------
// A household record is a small private document only the people in it can read. It holds what the
// household shares, today just its home address, so your partner gets it without anyone else in your
// circles seeing it. (Profiles are private to one person, so they can't carry a shared value.)
export type HouseholdDoc = { memberUids: string[]; home?: Place };

// Make the household record match who you listed: add the people you added, drop the ones you
// removed, and carry your saved home over if the household has none yet. Safe to call repeatedly.
export async function syncHousehold(added: string[], removed: string[]) {
  const uid = await ensureSignedIn();
  const mine = await getDocs(query(collection(db, 'households'), where('memberUids', 'array-contains', uid)));
  const existing = mine.docs[0];
  const myPlaces = ((await getDoc(doc(db, 'users', uid))).data() as { places?: Place[] } | undefined)?.places ?? [];
  const myHome = myPlaces.find((p) => p.label.trim().toLowerCase() === 'home');
  if (existing) {
    const data = existing.data() as HouseholdDoc;
    const merged = [...new Set([...data.memberUids.filter((u) => !removed.includes(u)), ...added, uid])];
    const patch: Record<string, unknown> = {};
    if (merged.length !== data.memberUids.length || merged.some((u) => !data.memberUids.includes(u))) patch.memberUids = merged;
    if (!data.home && myHome) patch.home = myHome;
    if (Object.keys(patch).length > 0) await updateDoc(existing.ref, patch);
  } else {
    await addDoc(collection(db, 'households'), { memberUids: [...new Set([uid, ...added])], ...(myHome ? { home: myHome } : {}) });
  }
}

// Save the home address: into the shared household record if you have one, otherwise onto your profile.
export async function saveHome(home: Place, household: { id: string } | null) {
  if (household) {
    await updateDoc(doc(db, 'households', household.id), { home });
    return;
  }
  const uid = await ensureSignedIn();
  const places = ((await getDoc(doc(db, 'users', uid))).data() as { places?: Place[] } | undefined)?.places ?? [];
  await savePlaces([home, ...places.filter((p) => p.label.trim().toLowerCase() !== 'home')]);
}
