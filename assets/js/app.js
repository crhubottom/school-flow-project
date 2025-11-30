import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  onAuthStateChanged,
  signOut as fbSignOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  getDocs,
  query,
  where,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "../../scripts/firebaseConfig.js";

const els = {
  signIn: typeof document !== 'undefined' ? document.getElementById("signInBtn") : null,
  signOut: typeof document !== 'undefined' ? document.getElementById("signOutBtn") : null,
  status: typeof document !== 'undefined' ? document.getElementById("status") : null,
  userMenu: typeof document !== 'undefined' ? document.getElementById('userMenu') : null,
};

function setStatus(text, isError = false, isSuccess = false) {
  if (!els.status) return;
  els.status.textContent = text || "";
  els.status.style.color = isError ? "var(--danger)" : isSuccess ? "var(--success)" : "var(--muted)";
}

let app = null;
let auth = null;
let db = null;
let provider = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  auth.useDeviceLanguage?.();
  provider = new GoogleAuthProvider();
  provider.setCustomParameters?.({ prompt: 'select_account' });
  try { db = getFirestore(app); } catch (e) { console.warn('Firestore init failed', e); }
  if (els.status) setStatus('Ready. Click "Continue with Google" to sign in.');
} catch (err) {
  console.error('Firebase init error', err);
  if (els.status) setStatus('Failed to initialize Firebase. Check your config.', true);
}

window.firebaseApp = app;
window.firebaseAuth = auth;
window.firestoreDB = db;
window.currentUser = null;
window.authReady = false;

window.startSignIn = async function startSignIn() {
  if (!auth || !provider) throw new Error('Auth not configured');
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, provider);
    } else {
      throw err;
    }
  }
};

window.doSignOut = async function doSignOut() {
  if (!auth) return;
  try {
    await fbSignOut(auth);
  } catch (e) { console.warn('Sign out failed', e); throw e; }
};

if (auth) {
  onAuthStateChanged(auth, user => {
    window.currentUser = user || null;
    try {
      const userNameEl = document.getElementById('userName');
      const userEmailEl = document.getElementById('userEmail');
      const userPhotoEl = document.getElementById('userPhoto');
      const avatarImg = document.getElementById('avatarImg');

      if (user) {
        if (userNameEl) userNameEl.textContent = user.displayName || 'Unnamed';
        if (userEmailEl) userEmailEl.textContent = user.email || '';
        if (userPhotoEl && user.photoURL) { userPhotoEl.src = user.photoURL; userPhotoEl.alt = (user.displayName||'User') + ' photo'; }
        if (avatarImg && user.photoURL) { avatarImg.src = user.photoURL; avatarImg.alt = (user.displayName||'User') + ' avatar'; }
        const signInBtn = document.getElementById('signInBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        if (signInBtn) signInBtn.style.display = 'none';
        if (signOutBtn) signOutBtn.style.display = 'inline-flex';
        try {
          if (db) {
            const profileRef = doc(db, 'users', user.uid);
            setDoc(profileRef, {
              displayName: user.displayName || '',
              email: user.email || '',
              photoURL: user.photoURL || '',
              updatedAt: serverTimestamp(),
            }, { merge: true }).catch(()=>{});
          }
        } catch(e){}
      } else {
        if (userNameEl) userNameEl.textContent = '—';
        if (userEmailEl) userEmailEl.textContent = '—';
        if (userPhotoEl) userPhotoEl.src = '';
        const signInBtn = document.getElementById('signInBtn');
        const signOutBtn = document.getElementById('signOutBtn');
        if (signInBtn) signInBtn.style.display = 'inline-flex';
        if (signOutBtn) signOutBtn.style.display = 'none';
      }
    } catch (e) {}

    if (user) {
      const path = location.pathname;
      if (path.endsWith('index.html') || path === '/' || path.endsWith('index')) {
        location.replace('home.html');
      }
    }

    window.authReady = true;
  });
}

function generateGroupCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function describeFSError(err) {
  const code = err?.code || '';
  switch (code) {
    case 'permission-denied': return 'Permission denied. Check Firestore rules and that the user is allowed to write.';
    case 'unavailable': return 'Firestore service unavailable. Try again later.';
    case 'deadline-exceeded': return 'Request timed out. Check your network connection.';
    default: return err?.message || 'Firestore request failed.';
  }
}

async function createGroup(groupName = '') {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in to create a group');

  const attempts = 6;
  for (let i = 0; i < attempts; i++) {
    const code = generateGroupCode();
    const groupRef = doc(db, 'groups', code);
    try {
      // Check whether a group already exists at this code. If the group exists and
      // is readable we'll skip this code; if the read is permission-denied it
      // likely means the doc exists but we aren't a member (treat as collision)
      // and try a different code.
      try {
        const snap = await getDoc(groupRef);
        if (snap.exists()) { continue; }
      } catch (readErr) {
        if (readErr?.code === 'permission-denied') {
          // debug stuff
          continue;
        }
        // debug stuff
        throw readErr;
      }
      const data = {
        ownerUid: user.uid,
        ownerDisplayName: user.displayName || '',
        members: [user.uid],
        code,
        name: (groupName || '').trim(),
        createdAt: serverTimestamp(),
      };

      try { console.info('Attempting to create group with payload:', { code, data }); } catch(e) {}
      try {
        await setDoc(groupRef, data);
        return { code };
      } catch (writeErr) {
        // debug stuff
        if (writeErr?.code === 'permission-denied') {
          console.error('createGroup: permission-denied while writing groups/%s. Intended payload:', code, data, writeErr);
          console.error('Check that your Firestore rules allow creating groups and that they are deployed to the correct project.');
        } else {
          console.error('createGroup: write error', writeErr);
        }
        throw writeErr;
      }
    } catch (err) {
      throw new Error(describeFSError(err));
    }
  }
  throw new Error('Failed to generate a unique join code. Try again.');
}
// debug stuff
async function joinGroup(code) {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in to join a group');
  if (!code) throw new Error('Group code is required');

  const clean = String(code).trim().toUpperCase();
  const groupRef = doc(db, 'groups', clean);
  try {
    await updateDoc(groupRef, { members: arrayUnion(user.uid) });
  } catch (err) {
    if (err?.code === 'not-found') {
      throw new Error('Group not found');
    }
    // debug stuff
    throw new Error(describeFSError(err));
  }

  try {
    const updated = await getDoc(groupRef);
    return { data: updated.exists() ? updated.data() : null };
  } catch (readErr) {
    console.warn('joinGroup: joined but failed to re-read group', readErr);
    return { data: null };
  }
}
//join group function
async function getGroup(code) {
  if (!db) throw new Error('Database not initialized');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Group code is required');
  try {
    const ref = doc(db, 'groups', clean);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Group not found');
    return { id: ref.id, data: snap.data() };
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}
//groups list function
async function listUserGroups() {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in');
  try {
    const q = query(collection(db, 'groups'), where('members', 'array-contains', user.uid));
    const snap = await getDocs(q);
    const out = [];
    snap.forEach(d => out.push({ id: d.id, data: d.data() }));
    return out;
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}
//update group name function
async function updateGroupName(code, newName) {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Group code is required');
  try {
    const ref = doc(db, 'groups', clean);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Group not found');
    const data = snap.data();
    if (data.ownerUid !== user.uid) throw new Error('Only the group owner can rename the group');
    await updateDoc(ref, { name: String(newName || '').trim() });
    const updated = await getDoc(ref);
    return { id: ref.id, data: updated.data() };
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}
//delete group function
async function deleteGroup(code) {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Group code is required');
  try {
    const ref = doc(db, 'groups', clean);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Group not found');
    const data = snap.data();
    if (data.ownerUid !== user.uid) throw new Error('Only the group owner can delete the group');
    await deleteDoc(ref);
    return { id: clean };
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}
//get users function for group page
async function getUsers(uids) {
  if (!db) throw new Error('Database not initialized');
  if (!Array.isArray(uids) || uids.length === 0) return {};
  try {
    const pairs = await Promise.all(uids.map(async uid => {
      const ref = doc(db, 'users', String(uid));
      const snap = await getDoc(ref);
      return { uid, data: snap.exists() ? snap.data() : null };
    }));
    const map = {};
    //trys to map user name to uid (doesnt work very well)
    pairs.forEach(p => { map[p.uid] = p.data || null; });
    return map;
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}
//create fee function
async function createFee(code, { amount, description = '', dueDate = null, currency = 'USD', recurring = null } = {}) {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in to create a fee');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Group code is required');
  if (!amount || Number(amount) <= 0) throw new Error('Amount must be greater than 0');
  try {
    const groupRef = doc(db, 'groups', clean);
    const snap = await getDoc(groupRef);
    if (!snap.exists()) throw new Error('Group not found');
    const g = snap.data();
    const isOwner = g.ownerUid && g.ownerUid === user.uid;
    if (!isOwner) throw new Error('Only the group owner can create fees');
    // Create fee doc in subcollection groups/{code}/fees
    const feesCol = collection(db, 'groups', clean, 'fees');
    const feeRef = doc(feesCol); // auto id
    const payload = {
      amount: Number(amount),
      currency: String(currency || 'USD'),
      description: String(description || ''),
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      status: 'open',
    };
    if (dueDate) {
      // Accept Date or ISO string
      const d = (dueDate instanceof Date) ? dueDate : new Date(dueDate);
      if (!isNaN(d.getTime())) payload.dueDate = d.toISOString();
    }
    if (recurring) payload.recurring = recurring;
    await setDoc(feeRef, payload);
    return { id: feeRef.id, data: payload };
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}
//delete fee function
async function deleteFee(code, feeId) {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in to delete a fee');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Group code is required');
  if (!feeId) throw new Error('Fee id is required');
  try {
    const feeRef = doc(db, 'groups', clean, 'fees', feeId);
    await deleteDoc(feeRef);
    return { id: feeId };
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}
async function removeMember(code, memberUid) {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in to remove members');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Group code is required');
  if (!memberUid) throw new Error('Member id is required');
  try {
    const ref = doc(db, 'groups', clean);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Group not found');
    const data = snap.data();
    if (data.ownerUid !== user.uid) throw new Error('Only the group owner can remove members');
    if (memberUid === user.uid) throw new Error('Use leave group if you need to exit.');
    if (!Array.isArray(data.members) || !data.members.includes(memberUid)) throw new Error('Member not found in group');
    await updateDoc(ref, { members: arrayRemove(memberUid) });
    return { id: clean, removed: memberUid };
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}

async function leaveGroup(code) {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in to leave a group');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Group code is required');
  try {
    const ref = doc(db, 'groups', clean);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Group not found');
    const data = snap.data();
    if (data.ownerUid === user.uid) {
      throw new Error('Owners must transfer or delete the group before leaving.');
    }
    await updateDoc(ref, { members: arrayRemove(user.uid) });
    return { id: clean };
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}
//set fee status function
async function setFeeStatus(code, feeId, status = 'open') {
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in to update a fee');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Group code is required');
  if (!feeId) throw new Error('Fee id is required');
  const nextStatus = status === 'paid' ? 'paid' : 'open';
  try {
    const feeRef = doc(db, 'groups', clean, 'fees', feeId);
    await updateDoc(feeRef, { status: nextStatus, statusUpdatedAt: serverTimestamp(), statusUpdatedBy: user.uid });
    return { id: feeId, status: nextStatus };
  } catch (err) {
    throw new Error(describeFSError(err));
  }
}
//list group fees function
async function listGroupFees(code) {
  if (!db) throw new Error('Database not initialized');
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) throw new Error('Group code is required');
  try {
    const feesCol = collection(db, 'groups', clean, 'fees');
    const snap = await getDocs(feesCol);
    const out = [];
    snap.forEach(d => out.push({ id: d.id, data: d.data() }));
    out.sort((a,b) => {
      const ad = a.data.dueDate ? Date.parse(a.data.dueDate) : Infinity;
      const bd = b.data.dueDate ? Date.parse(b.data.dueDate) : Infinity;
      return ad - bd;
    });
    return out;
  } catch (err) { throw new Error(describeFSError(err)); }
}
//list upcoming fees for user function
async function listUpcomingFeesForUser() {
  // Returns { items: [{ groupId, groupName, feeId, fee }], errors: [ { groupId, error } ] }
  if (!db) throw new Error('Database not initialized');
  if (!auth) throw new Error('Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('User must be signed in');
  try {
    const groups = await listUserGroups();
    try { console.info('listUpcomingFeesForUser: found groups count=', groups.length); } catch(e){}
    const results = [];
    const errors = [];
    await Promise.all(groups.map(async g => {
      try {
        const fees = await listGroupFees(g.id);
        try { console.info('listUpcomingFeesForUser: group', g.id, 'name=', g.data?.name, 'fees=', fees.length); } catch(e){}
        fees.forEach(f => {
          const status = f.data.status || 'open';
          if (status === 'paid') return; // skip paid
          results.push({ groupId: g.id, groupName: g.data?.name || g.id, feeId: f.id, fee: { ...f.data, groupName: g.data?.name || g.id } });
        });
      } catch (e) {
        try { console.warn('listUpcomingFeesForUser: failed to load fees for group', g.id, e); } catch(e){}
        errors.push({ groupId: g.id, error: e?.message || String(e) });
      }
    }));
    // sort by dueDate ascending (missing dueDate last)
    results.sort((a,b) => {
      const ad = a.fee.dueDate ? Date.parse(a.fee.dueDate) : Infinity;
      const bd = b.fee.dueDate ? Date.parse(b.fee.dueDate) : Infinity;
      return ad - bd;
    });
    try { console.info('listUpcomingFeesForUser: total unpaid items=', results.length); } catch(e){}
    return { items: results, errors };
  } catch (err) { throw new Error(describeFSError(err)); }
}
//firestore helpers export
window.firestoreHelpers = {
  createGroup,
  joinGroup,
  getGroup,
  generateGroupCode,
  listUserGroups,
  updateGroupName,
  deleteGroup,
  getUsers,
  createFee,
  deleteFee,
  removeMember,
  leaveGroup,
  setFeeStatus,
  listGroupFees,
  listUpcomingFeesForUser,
 };

if (typeof document !== 'undefined') {
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  if (signInBtn) signInBtn.addEventListener('click', async () => { try { await window.startSignIn(); } catch (e) { setStatus(e?.message||'Sign-in failed', true); } });
  if (signOutBtn) signOutBtn.addEventListener('click', async () => { try { await window.doSignOut(); location.replace('index.html'); } catch (e) { setStatus(e?.message||'Sign-out failed', true); } });
}
