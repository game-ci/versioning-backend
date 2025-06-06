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

### 3. Build Functions Code

Before running the emulators, you need to build the functions code:

```bash
cd functions
yarn build
```

This will compile the TypeScript code into JavaScript in the `lib` directory, which the emulator needs to run the functions.

### 4. Set Up Credentials

> **Note**: For basic local development and testing, you can skip this step initially. You'll see some warnings in the emulator output, but most functionality will still work. If you need to test integrations or need full functionality, follow these steps.

#### Firebase Admin SDK

To use Firebase Admin SDK locally:

1. Download a service account key from your Firebase project settings:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project
   - Go to Project Settings > Service accounts
   - Click "Generate new private key"
   - Save the JSON file securely

2. Set the environment variable to the key file:

**Linux / macOS**:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
```

**Windows (PowerShell)**:
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccountKey.json"
```

> Note: Without this setup, you'll see warnings about being unable to fetch Admin SDK configuration, but the emulators will still run in a limited capacity.

#### Integration Environment Variables

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

### 5. Run Locally

```bash
firebase emulators:start
```

This starts the Firebase emulators for Functions and Firestore, with hosting on port 5002 to avoid common port conflicts.

#### Prerequisites for Emulators

- **Java Runtime Environment**: Firebase emulators require Java to be installed and available on your system PATH
- **Firebase Login**: Run `firebase login` to authenticate the CLI

#### Port Configuration

This project's `firebase.json` is already configured to use port 5002 for the hosting emulator instead of the default port 5000, which helps avoid conflicts with AirPlay Receiver on macOS.

You're free to customize these ports for your local development environment as needed. If you encounter port conflicts, you can modify the port numbers in your `firebase.json`:

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

Modifying these ports only affects local development environment and won't impact deployment.

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
2. Build the functions code:
   ```bash
   cd functions && yarn build
   ```
3. Run the emulator to test locally:
   ```bash
   firebase emulators:start
   ```
4. For hot reloading during development:
   ```bash
   # In one terminal
   cd functions && yarn watch
   
   # In another terminal  
   firebase emulators:start
   ```
5. Test your changes
6. Deploy when ready

## Troubleshooting

- **Firebase Login Issues**: Make sure you have access to the Firebase project
- **Emulator Port Conflicts**: 
  - Check for services using ports 4000, 5001, 8080, or 9000
  - This project uses port 5002 for hosting to avoid conflicts with AirPlay Receiver on macOS
  - Feel free to change any port in your local `firebase.json` if you encounter conflicts
  - See the [Port Configuration](#port-configuration) section for details
- **Java Not Found Error**: 
  - The Firebase emulators require Java to be installed
  - On macOS, install Java using `brew install openjdk@17` or download from [java.com](https://www.java.com)
  - Make sure Java is on your PATH: `java -version` should return the installed version
- **Missing Functions Library Error** (`functions/lib/index.js does not exist`):
  - This indicates that the TypeScript code hasn't been compiled
  - Run `cd functions && yarn build` to compile the code
  - If that doesn't work, check for TypeScript compilation errors in the build output
- **Admin SDK Configuration Errors**:
  - Set up the `GOOGLE_APPLICATION_CREDENTIALS` environment variable as described in the [Set Up Credentials](#4-set-up-credentials) section
  - For testing, you can often ignore this warning as the emulators will still run with limited functionality
- **Integration Issues**: 
  - Ensure all required environment variables are correctly set
  - For local development without integration testing, you can often proceed without setting these variables
