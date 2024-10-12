# Development Guide

This guide will help you set up the development environment, deploy the backend, and configure necessary integrations and credentials.

<!-- TOC -->
* [Development Guide](#development-guide)
  * [Prerequisites](#prerequisites)
  * [Setup](#setup)
    * [1. Install Firebase CLI](#1-install-firebase-cli)
    * [2. Install Project Dependencies](#2-install-project-dependencies)
    * [3. Run the Project Locally](#3-run-the-project-locally)
  * [Deployment](#deployment)
    * [1. Login to Firebase](#1-login-to-firebase)
    * [2. Deploy Project to Firebase](#2-deploy-project-to-firebase)
  * [Optional Local Setup for Firebase Admin SDK](#optional-local-setup-for-firebase-admin-sdk)
    * [Setting Up Credentials](#setting-up-credentials)
      * [Linux / MacOS](#linux--macos)
      * [Windows (PowerShell)](#windows-powershell)
  * [Integrations & Environment Variables](#integrations--environment-variables)
    * [Discord Integration](#discord-integration)
    * [GitHub Integration](#github-integration)
    * [Internal Token (for Self-Authentication)](#internal-token-for-self-authentication)
  * [Updating Configuration Variables in Firebase](#updating-configuration-variables-in-firebase)
  * [Local Development Commands](#local-development-commands)
  * [Troubleshooting & Tips](#troubleshooting--tips)
  * [Contributing](#contributing)
<!-- TOC -->

## Prerequisites

Ensure you have the following installed:

- [**Node.js**](https://nodejs.org/en) (Recommended: Version 20 or later)
- [**Yarn**](https://classic.yarnpkg.com/en/docs/install/) (Package manager)

## Setup

### 1. Install Firebase CLI

To interact with Firebase, install the Firebase CLI globally:

```bash
npm i -g firebase-tools
```

### 2. Install Project Dependencies

Navigate to the project directory and install all required dependencies:

```bash
yarn install
```

### 3. Run the Project Locally

You can serve the Firebase functions, Firestore, and any other emulated services locally:

```bash
firebase emulators:start
```

Alternatively, to only run specific services, use the `--only` flag:

```bash
firebase emulators:start --only functions,firestore
```

This command starts up all emulators based on your configuration in `firebase.json`.

---

## Deployment

_Note: Deployment requires access to the Firebase project. You can also deploy to a different project by changing the project ID in the `.firebaserc` file._

### 1. Login to Firebase

Ensure you're authenticated with the correct Firebase account:

```bash
firebase login
```

### 2. Deploy Project to Firebase

Deploy all services (functions, Firestore rules, hosting, etc.) to the configured Firebase project:

```bash
firebase deploy
```

To deploy specific services only, use the `--only` flag:

```bash
firebase deploy --only functions
```

---

## Optional Local Setup for Firebase Admin SDK

### Setting Up Credentials

To use Firebase Admin SDK locally (e.g., for accessing Firestore securely), you need to provide service account credentials:

1. Download the service account JSON file from your Firebase project settings.
2. Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of this file.

#### Linux / MacOS

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/Downloads/service-account-file.json"
```

#### Windows (PowerShell)

```ps
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\username\Downloads\service-account-file.json"
```

_For more information, see the [Firebase Admin SDK setup documentation](https://firebase.google.com/docs/admin/setup)._

---

## Integrations & Environment Variables

To test integrations like Discord and GitHub, set the following environment variables:

### Discord Integration

```bash
export DISCORD_TOKEN="your_discord_token"
```

### GitHub Integration

```bash
export GITHUB_CLIENT_SECRET="your_github_app_client_secret"
export GITHUB_PRIVATE_KEY="your_github_app_private_key"
```

### Internal Token (for Self-Authentication)

The internal token is used for secure communication, such as with the [Docker repo](https://github.com/Unity-CI/docker).

```bash
export INTERNAL_TOKEN="your_internal_token"
```

The token can be any string, as long as it matches the token configured in the related Docker repo.

---

## Updating Configuration Variables in Firebase

If you need to set or update configuration variables (e.g., when migrating environments or rotating security tokens), use the following commands:

```bash
firebase functions:config:set discord.token="your_discord_token"
firebase functions:config:set github.client-secret="your_github_app_client_secret"
firebase functions:config:set github.private-key="your_github_app_private_key"
firebase functions:config:set internal.token="your_internal_token"
```

---

## Local Development Commands

- **Start Firebase Emulators:** To run all services locally:
  ```bash
  firebase emulators:start
  ```

- **Start Specific Emulators Only:** To run specific components (e.g., `functions` only):
  ```bash
  firebase emulators:start --only functions
  ```

- **Deploy Changes:** After making changes, deploy to Firebase:
  ```bash
  firebase deploy
  ```

---

## Troubleshooting & Tips

- **Ensure Environment Variables are Set:** Make sure all necessary environment variables are set correctly before running the emulators or deploying.
- **Testing Integrations Locally:** When testing functionality that requires external services (e.g., Discord, GitHub), ensure your local credentials are set up as described above.

---

## Contributing

If you're interested in contributing to the project, make sure to review our [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines, code style, and other requirements.

Happy coding! ❤️
