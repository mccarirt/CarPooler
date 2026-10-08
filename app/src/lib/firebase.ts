import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

// Web config values are identifiers, not secrets. Access is controlled by
// Firestore/RTDB security rules, not by hiding these.
const firebaseConfig = {
  apiKey: 'AIzaSyDfPV9_Wmx9-P1ZuTWCGKJ8yoRngq3tHtc',
  authDomain: 'carpooler-c50f3.firebaseapp.com',
  projectId: 'carpooler-c50f3',
  storageBucket: 'carpooler-c50f3.firebasestorage.app',
  messagingSenderId: '664289934325',
  appId: '1:664289934325:web:0cb23baf3b8b060e37bebc',
  // Realtime Database URL: copy from Firebase console > Realtime Database
  // and paste here (looks like https://carpooler-c50f3-default-rtdb.firebaseio.com).
  databaseURL: 'https://carpooler-c50f3-default-rtdb.firebaseio.com',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
