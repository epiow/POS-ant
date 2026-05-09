# Sari-Sari Store POS — Firebase Setup Guide

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"**
3. Enter a project name (e.g., `sari-sari-pos`)
4. (Optional) Disable Google Analytics if not needed
5. Click **"Create project"**

## 2. Enable Email/Password Authentication

1. In your Firebase project, go to **Build → Authentication**
2. Click **"Get started"**
3. Under **Sign-in method**, click **"Email/Password"**
4. Toggle **Enable** and click **Save**

## 3. Create Your First User (Admin)

1. Still in **Authentication**, go to the **Users** tab
2. Click **"Add user"**
3. Enter an email and password (e.g., `admin@store.com` / `Admin123!`)
4. Click **"Add user"**
5. **Copy the UID** — you'll need it in the next step

## 4. Create Firestore Database

1. Go to **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (we'll add proper rules later)
4. Select a region closest to you
5. Click **"Done"**

## 5. Add Admin User Document in Firestore

1. In Firestore, click **"Start collection"**
2. Set Collection ID: `users`
3. Set Document ID: *paste the UID you copied in Step 3*
4. Add these fields:
   - `role` (string): `admin`
   - `name` (string): `Admin` (or your preferred display name)
5. Click **"Save"**

### Adding a Cashier User

Repeat Steps 3 & 5 with:
- A new email/password in Authentication
- A new document in the `users` collection with `role: "cashier"`

## 6. Get Firebase Config

1. Go to **Project Settings** (gear icon → Project settings)
2. Scroll down to **"Your apps"**
3. Click the web icon (`</>`) to add a web app
4. Enter a nickname (e.g., `pos-web`)
5. Click **"Register app"**
6. Copy the `firebaseConfig` object
7. Open `js/firebase-config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## 7. Set Firestore Security Rules

1. In Firestore, go to the **Rules** tab
2. Replace the default rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users collection: read-only for authenticated users
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if false; // Manage via Firebase Console only
    }

    // Products collection: admin can do anything, cashiers can only update stock
    match /products/{productId} {
      allow read: if request.auth != null;

      // Full write access for admin
      allow create, delete: if request.auth != null &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";

      // Update: admin can update anything, cashier can only update stock
      allow update: if request.auth != null && (
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin" ||
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['stock'])
      );
    }

    // Transactions: any authenticated user can read/write
    match /transactions/{transactionId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Click **"Publish"**

## 8. Deploy to GitHub Pages

1. Create a new GitHub repository
2. Push all files to the repository:
   ```bash
   git init
   git add .
   git commit -m "Initial POS app"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
3. Go to repository **Settings → Pages**
4. Under **Source**, select **"Deploy from a branch"**
5. Select **main** branch and **/ (root)** folder
6. Click **Save**
7. Your app will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Login fails with "No account found" | Make sure you created the user in Firebase Auth (Step 3) |
| Login works but shows "cashier" role | Verify the user document exists in Firestore `users` collection with the correct UID |
| Products don't save | Check that your Firestore rules are published and user role is "admin" |
| "Permission denied" errors | Verify Firestore security rules match the ones above |
| App doesn't load on GitHub Pages | Ensure `index.html` is in the root of the repository |
