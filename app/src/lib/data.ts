import { signInAnonymously } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';

export type Profile = { name: string; car: string };
export type Membership = { circleName: string; role: 'admin' | 'member' };
export type Member = { uid: string; name: string; car: string; role: 'admin' | 'member' };
export type Circle = { name: string; adminUid: string; inviteCode: string };
export type Kid = {
  name: string;
  notes: string;
  emergencyName: string;
  emergencyPhone: string;
  ownerUid: string;
  ownerName: string;
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
  await setDoc(doc(db, 'users', uid), { name: name.trim(), car: car.trim() });
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
    role: 'admin',
  });
  batch.set(doc(db, 'invites', code), { circleId: circleRef.id, circleName });
  batch.set(doc(db, 'users', uid, 'memberships', circleRef.id), { circleName, role: 'admin' });
  await batch.commit();
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
    role: 'member',
    code,
  });
  batch.set(doc(db, 'users', uid, 'memberships', invite.circleId), {
    circleName: invite.circleName,
    role: 'member',
  });
  await batch.commit();
  return invite.circleId;
}

export async function addKid(circleId: string, kid: Omit<Kid, 'ownerUid' | 'ownerName'>, owner: Profile) {
  const uid = await ensureSignedIn();
  const ref = await addDoc(collection(db, 'circles', circleId, 'kids'), {
    ...kid,
    ownerUid: uid,
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
