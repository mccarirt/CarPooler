import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, collection, writeBatch, addDoc, getDocs, updateDoc } from 'firebase/firestore';
import { writeFileSync, readFileSync } from 'node:fs';
const cfg = { apiKey: 'AIzaSyDfPV9_Wmx9-P1ZuTWCGKJ8yoRngq3tHtc', authDomain: 'carpooler-c50f3.firebaseapp.com', projectId: 'carpooler-c50f3', appId: '1:664289934325:web:0cb23baf3b8b060e37bebc' };
const app = initializeApp(cfg, 'seed');
const cred = await signInAnonymously(getAuth(app));
const A = cred.user.uid, db = getFirestore(app);
const stateFile = process.argv[3];
const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

if (true) {
  const code = 'DEMO' + Math.random().toString(36).slice(2, 6).toUpperCase();
  const cref = doc(collection(db, 'circles')); const cid = cref.id;
  const b = writeBatch(db);
  b.set(cref, { name: 'Demo Elementary', adminUid: A, inviteCode: code });
  b.set(doc(db, 'circles', cid, 'members', A), { uid: A, name: 'Dana Whitfield', car: 'Blue Odyssey', role: 'admin' });
  b.set(doc(db, 'invites', code), { circleId: cid, circleName: 'Demo Elementary' });
  await b.commit();
  const k1 = (await addDoc(collection(db, 'circles', cid, 'kids'), { name: 'Maya Whitfield', notes: 'Booster seat', emergencyName: '', emergencyPhone: '', ownerUid: A, ownerName: 'Dana Whitfield' })).id;
  const k2 = (await addDoc(collection(db, 'circles', cid, 'kids'), { name: 'Theo Whitfield', notes: '', emergencyName: '', emergencyPhone: '', ownerUid: A, ownerName: 'Dana Whitfield' })).id;
  const leg = {
    direction: 'AM', days: [1, 2, 3, 4, 5, 6, 7], startDate: today, windowStart: '07:40', windowEnd: '08:15',
    stops: [
      { label: 'Whitfield home', time: '07:45', kidIds: [k1], address: 'Lincoln Park, Washington DC', lat: 38.8895, lng: -76.9936 },
      { label: 'Henderson home', time: '07:55', kidIds: [k2], address: 'Union Station, Washington DC', lat: 38.8977, lng: -77.0065 },
      { label: 'Demo Elementary', time: '08:10', kidIds: [], address: 'Dupont Circle, Washington DC', lat: 38.9101, lng: -77.0434 },
    ],
    driverMode: 'rotation', rotationOffset: 0,
  };
  const legId = (await addDoc(collection(db, 'circles', cid, 'legs'), leg)).id;
  writeFileSync(stateFile, JSON.stringify({ cid, code, legId, A }));
  console.log(JSON.stringify({ cid, code, legId }));
}
if (true) {
  for (let i = 0; i < 120; i++) { const ms = (await getDocs(collection(db, 'circles', JSON.parse(readFileSync(stateFile, 'utf8')).cid, 'members'))).docs; if (ms.length > 1) break; await new Promise((r) => setTimeout(r, 2000)); }
  const st = JSON.parse(readFileSync(stateFile, 'utf8'));
  const members = (await getDocs(collection(db, 'circles', st.cid, 'members'))).docs.map((x) => x.data());
  const other = members.find((m) => m.uid !== st.A);
  console.log('members', members.map((m) => m.name));
  if (other) {
    await updateDoc(doc(db, 'circles', st.cid, 'legs', st.legId), { driverMode: 'fixed', fixedUid: other.uid });
    console.log('driver set to', other.name);
  }
}
process.exit(0);
