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
export type Profile = { name: string; car: string; color?: string; icon?: string; household?: string[]; places?: Place[] };
export type Membership = { circleName: string; role: 'admin' | 'member' };
export type Member = { uid: string; name: string; car: string; role: 'admin' | 'member'; color?: string; icon?: string };
export type Circle = { name: string; adminUid: string; inviteCode: string; rotation?: string[]; coOrganizerUids?: string[]; archived?: boolean };
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
    ...(profile.icon ? { icon: profile.icon } : {}),
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
    ...(profile.icon ? { icon: profile.icon } : {}),
    role: 'member',
    code,
  });
  batch.set(doc(db, 'users', uid, 'memberships', invite.circleId), {
    circleName: invite.circleName,
    role: 'member',
  });
  batch.delete(doc(db, 'circles', invite.circleId, 'requests', uid)); // the approval is good for one joining only
  await batch.commit();
  await ensureRealtimeAccess(invite.circleId, code, false).catch(() => {});
  await remove(ref(rtdb, `circleApprovals/${invite.circleId}/${uid}`)).catch(() => {});
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
  const before = ((await getDoc(doc(db, 'circles', circleId))).data() as Circle | undefined)?.coOrganizerUids ?? [];
  await updateDoc(doc(db, 'circles', circleId), { coOrganizerUids: uids });
  // The live-location database cannot see the main one, so it keeps its own copy of who the organizers are.
  for (const u of uids) await set(ref(rtdb, `circleOrganizers/${circleId}/${u}`), true).catch(() => {});
  for (const u of before.filter((x) => !uids.includes(x))) await remove(ref(rtdb, `circleOrganizers/${circleId}/${u}`)).catch(() => {});
}

// Make that copy match, for organizers named before it existed. Safe to repeat. Only the starter's phone can write it.
export async function syncOrganizerMirror(circleId: string, uids: string[]) {
  for (const u of uids) await set(ref(rtdb, `circleOrganizers/${circleId}/${u}`), true).catch(() => {});
}

// Change your name or car everywhere it is shown: your profile and your card in every circle.
export async function updateProfileEverywhere(name: string, car: string, color?: string, icon?: string) {
  const uid = await ensureSignedIn();
  const clean = { name: name.trim(), car: car.trim(), ...(color ? { color } : {}), ...(icon ? { icon } : {}) };
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
  // Only a record made of you and people you listed (or are adding or removing now) is yours. A stranger
  // can list you in theirs; never copy your home into one of those.
  const profileHousehold = ((await getDoc(doc(db, 'users', uid))).data() as { household?: string[] } | undefined)?.household ?? [];
  const allowed = new Set([uid, ...profileHousehold, ...added, ...removed]);
  const existing = mine.docs.find((d) => (d.data() as HouseholdDoc).memberUids.every((u) => allowed.has(u)));
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

// ---------- a family's new phone ----------
// A sign-in lives in one browser, so a parent who loses it comes back as a brand-new person. An organizer
// can hand everything the old one held to the new one: rides that always use them, their turn in the
// driving order, their place as a parent on children the organizer can edit, driver changes still ahead,
// and a spot in the organizer's household. The old card is then removed. Returns what changed, as plain text.
export async function handOverMember(circleId: string, oldUid: string, newUid: string, today: string) {
  const me = await ensureSignedIn();
  const notes: string[] = [];
  const swap = (list: string[]) => [...new Set(list.map((u) => (u === oldUid ? newUid : u)))];

  // Rides that always use the old parent.
  const legs = await getDocs(collection(db, 'circles', circleId, 'legs'));
  let n = 0;
  for (const l of legs.docs) {
    if ((l.data() as { fixedUid?: string }).fixedUid === oldUid) {
      await updateDoc(l.ref, { fixedUid: newUid });
      n++;
    }
  }
  if (n) notes.push(`${n} ride${n === 1 ? '' : 's'} now use the new phone`);

  // Driver changes still to come.
  const inst = await getDocs(collection(db, 'circles', circleId, 'instances'));
  n = 0;
  for (const o of inst.docs) {
    const date = o.id.split('_')[1] ?? '';
    if ((o.data() as { driverUid?: string }).driverUid === oldUid && date >= today) {
      await updateDoc(o.ref, { driverUid: newUid });
      n++;
    }
  }
  if (n) notes.push(`${n} upcoming driver change${n === 1 ? '' : 's'} moved`);

  // The driving order and (for the circle's starter) the co-organizer list.
  const circleRef = doc(db, 'circles', circleId);
  const circle = (await getDoc(circleRef)).data() as Circle;
  const rotation = (circle.rotation ?? []).includes(oldUid) ? swap(circle.rotation ?? []) : null;
  const patch: Record<string, unknown> = {};
  if (rotation) patch.rotation = rotation;
  if (circle.adminUid === me && circle.coOrganizerUids?.includes(oldUid)) patch.coOrganizerUids = swap(circle.coOrganizerUids);
  if (Object.keys(patch).length) {
    await updateDoc(circleRef, patch);
    notes.push('driving order updated');
  }

  // Children the organizer is a parent of.
  const kids = await getDocs(collection(db, 'circles', circleId, 'kids'));
  n = 0;
  for (const k of kids.docs) {
    const kid = k.data() as Kid;
    const current = guardiansOf(kid);
    if (!current.includes(oldUid) || !current.includes(me)) continue;
    await updateDoc(k.ref, { guardianUids: swap(current) });
    n++;
  }
  if (n) notes.push(`${n} child profile${n === 1 ? '' : 's'} shared with the new phone`);

  // The organizer's own household.
  const mine = await getDocs(query(collection(db, 'households'), where('memberUids', 'array-contains', me)));
  for (const h of mine.docs) {
    const uids = (h.data() as HouseholdDoc).memberUids;
    if (uids.includes(oldUid)) {
      await updateDoc(h.ref, { memberUids: swap(uids) });
      notes.push('household updated');
    }
  }
  const profile = (await getDoc(doc(db, 'users', me))).data() as Profile | undefined;
  if (profile?.household?.includes(oldUid)) await setDoc(doc(db, 'users', me), { household: swap(profile.household) }, { merge: true });

  // Last, remove the old card, and close every door it held.
  await deleteDoc(doc(db, 'circles', circleId, 'requests', oldUid)).catch(() => {});
  await remove(ref(rtdb, `circleApprovals/${circleId}/${oldUid}`)).catch(() => {});
  await remove(ref(rtdb, `circleMembers/${circleId}/${oldUid}`)).catch(() => {});
  await deleteDoc(doc(db, 'circles', circleId, 'members', oldUid));
  notes.push('old card removed');
  return notes;
}

// ---------- asking to join ----------
// An invite link only lets someone ASK to join. The person who started the circle approves or declines.
export type JoinRequest = { uid: string; name: string; car: string; color?: string; icon?: string; code: string; status: 'pending' | 'approved' | 'declined'; createdAt: number };

export async function requestToJoin(circleId: string, code: string, profile: Profile) {
  const uid = await ensureSignedIn();
  await deleteDoc(doc(db, 'circles', circleId, 'requests', uid)).catch(() => {}); // clears an old declined ask
  const req: JoinRequest = {
    uid,
    name: profile.name,
    car: profile.car,
    ...(profile.color ? { color: profile.color } : {}),
    ...(profile.icon ? { icon: profile.icon } : {}),
    code,
    status: 'pending',
    createdAt: Date.now(),
  };
  await setDoc(doc(db, 'circles', circleId, 'requests', uid), req);
}

// The circle's starter decides. An approval is also recorded in the live-location database, which cannot
// see the main one, so it only lets an approved person in too.
export async function decideJoin(circleId: string, requestUid: string, approve: boolean) {
  if (approve) await set(ref(rtdb, `circleApprovals/${circleId}/${requestUid}`), true);
  await updateDoc(doc(db, 'circles', circleId, 'requests', requestUid), { status: approve ? 'approved' : 'declined' });
}

// Archive a circle: it disappears from everyone's lists and nothing is deleted. Only the person who started
// it can archive or restore it.
export async function archiveCircle(circleId: string, archived: boolean) {
  await updateDoc(doc(db, 'circles', circleId), { archived });
}

// An organizer corrects who drove a ride that has a record (for example when the wrong parent tapped Start).
// The old driver's live position is cleared so the right driver's phone can take over.
export async function reassignDriver(circleId: string, key: string, newDriverUid: string) {
  await updateDoc(doc(db, 'circles', circleId, 'runs', key), { driverUid: newDriverUid });
  await remove(ref(rtdb, livePath(circleId, key))).catch(() => {});
}

// ---------- sharing your location with a circle ----------
// Opt-in and time-boxed: you pick a circle and how long (at most two hours). A small record in the circle says
// who is sharing and until when, so everyone else can find it; the position itself goes in the live-location
// database under share_<your id>. Stopping, or running out of time, deletes both.
export type ShareDoc = { uid: string; name: string; color?: string; icon?: string; note?: string; startedAt: number; expiresAt: number };
export const shareKey = (uid: string) => `share_${uid}`;
export const MAX_SHARE_MINUTES = 120;

export async function startShare(circleId: string, profile: Profile, note: string, minutes: number) {
  const uid = await ensureSignedIn();
  const now = Date.now();
  const share: ShareDoc = {
    uid,
    name: profile.name,
    ...(profile.color ? { color: profile.color } : {}),
    ...(profile.icon ? { icon: profile.icon } : {}),
    ...(note.trim() ? { note: note.trim().slice(0, 80) } : {}),
    startedAt: now,
    expiresAt: now + Math.min(minutes, MAX_SHARE_MINUTES) * 60000,
  };
  await setDoc(doc(db, 'circles', circleId, 'shares', uid), share);
}

export async function stopShare(circleId: string) {
  const uid = await ensureSignedIn();
  await clearPosition(circleId, shareKey(uid));
  await deleteDoc(doc(db, 'circles', circleId, 'shares', uid));
}
