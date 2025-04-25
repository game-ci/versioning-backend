# Development Guide

This guide helps you set up the development environment for the GameCI Versioning Backend.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+ (required for Firebase Functions)
- [Yarn](https://yarnpkg.com/) for package management
- [Firebase CLI](https://firebase.google.com/docs/cli) for local development and deployment
- [Java Runtime Environment](https://www.java.com/) for Firebase emulators

> **Tip:** Use [nvm](https://github.com/nvm-sh/nvm), [n](https://github.com/tj/n), or [volta](https://volta.sh/) to manage Node.js versions.

## Setup

### 1. Install Firebase CLI

```bash
npm i -g firebase-tools
```

### 2. Install Dependencies

Install dependencies in both root repository and `functions` directory:

```bash
yarn install
```

```bash
cd functions
yarn install
```

### 3. Run Locally

```bash
firebase emulators:start
```

This starts the Firebase emulators for Functions and Firestore.

#### Prerequisites for Emulators

- **Java Runtime Environment**: Firebase emulators require Java to be installed and available on your system PATH
- **Firebase Login**: Run `firebase login` to authenticate the CLI

#### Port Configuration

On macOS, port 5000 (used by the Hosting emulator) might be in use by AirPlay Receiver. You can configure a different port in your `firebase.json`:

```json
{
  "emulators": {
    "hosting": {
      "port": 5002
    },
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    }
  }
}
```

## Credentials Setup

### Firebase Admin SDK

To use Firebase Admin SDK locally:

1. Download a service account key from your Firebase project settings
2. Set the environment variable to the key file

**Linux / macOS**:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
```

**Windows (PowerShell)**:
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccountKey.json"
```

### Integration Environment Variables

To test integrations locally, set these environment variables:

**Discord**:
```bash
export DISCORD_TOKEN="your_discord_token"
```

**GitHub**:
```bash
export GITHUB_CLIENT_SECRET="your_github_app_client_secret"
export GITHUB_PRIVATE_KEY="your_github_app_private_key"
```

**Internal Token**:
```bash
export INTERNAL_TOKEN="your_internal_token"
```

> The internal token is used for self-authentication and communication with the [docker repo](https://github.com/Unity-CI/docker).

## Deployment

> **Note:** You need project access to deploy.

1. Login to Firebase:
   ```bash
   firebase login
   ```

2. Deploy everything:
   ```bash
   firebase deploy
   ```

   Or deploy specific services:
   ```bash
   firebase deploy --only functions
   ```

## Firebase Configuration

Update environment variables in Firebase (useful when rotating tokens or migrating environments):

```bash
firebase functions:config:set discord.token="your_discord_token"
firebase functions:config:set github.client-secret="your_github_app_client_secret"
firebase functions:config:set github.private-key="your_github_app_private_key"
firebase functions:config:set internal.token="your_internal_token"
```

> Note: Firebase Functions configuration uses dot notation (e.g., `internal.token`) when setting with the CLI, but when using environment variables locally, use uppercase without dots (e.g., `INTERNAL_TOKEN`). This is due to how Firebase handles different configuration methods.

## Development Workflow

1. Make changes to code in `functions/src/`
2. Run the emulator to test locally:
   ```bash
   firebase emulators:start
   ```
3. For hot reloading during development:
   ```bash
   # In one terminal
   cd functions && yarn watch
   
   # In another terminal  
   firebase emulators:start
   ```
4. Test your changes
5. Deploy when ready

## Troubleshooting

- **Firebase Login Issues**: Make sure you have access to the Firebase project
- **Emulator Port Conflicts**: 
  - Check for services using ports 4000, 5001, 8080, or 9000
  - On macOS, port 5000 is commonly used by AirPlay Receiver - configure a different port as shown in the [Port Configuration](#port-configuration) section
- **Java Not Found Error**: 
  - The Firebase emulators require Java to be installed
  - On macOS, install Java using `brew install openjdk@17` or download from [java.com](https://www.java.com)
  - Make sure Java is on your PATH: `java -version` should return the installed version
- **Admin SDK Errors**: Verify your service account file has the correct permissions
- **Integration Issues**: Ensure environment variables are correctly set
