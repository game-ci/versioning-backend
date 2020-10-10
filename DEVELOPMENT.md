# Development

Some keys are set as environment variables;


## Local Setup (optional)

#### Credentials

To be able to use functions that use the Firebase AdminSDK you need to set credentials.

1. Download the service account file from firebase
2. Set the path to that file to an environment variable

__Linux / MacOS__

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/home/user/Downloads/service-account-file.json"
```

__Windows (PowerShell)__

```ps
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\username\Downloads\service-account-file.json"
```

_(for more information, please see the [docs](https://firebase.google.com/docs/admin/setup))_

#### Integrations

To test specific functionality like the integrations you will also have to set the following environment variables

__Discord__

```bash
export discord.token="my_discord_token"
```

__Github__

```bash
export github.client-secret="my_github_app_client_secret"`
export github.private-key="my_github_app_private_key"
```

## Local Commands

In order to run firebase locally simply use

```
firebase serve
```

To only run one component, like `hosting`, `functions` or `firestore` you may use the `--only` flag.

```
firebase serve --only functions
```

If everything works, finally deploy the changes

```
firebase deploy
```

## New project setup 

_(only when migrating to new firebase project / environment)_

```
firebase functions:config:set discord.token="my_discord_token"
firebase functions:config:set github.client-secret="my_github_app_client_secret"
firebase functions:config:set discord.private-key="my_github_app_private_key"
```