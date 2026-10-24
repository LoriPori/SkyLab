# Email setup (verification codes via Gmail)

When someone signs up, the worker sends a 6-digit code to confirm their email address. It does this through the **Gmail API**, using an OAuth2 refresh token for a Gmail account you control. No third-party email service is needed.

This guide shows how to obtain the three values the worker needs:

| Secret | What it is |
|---|---|
| `GMAIL_CLIENT_ID` | OAuth client ID from Google Cloud |
| `GMAIL_CLIENT_SECRET` | OAuth client secret from Google Cloud |
| `GMAIL_REFRESH_TOKEN` | Long-lived token that lets the worker send as your account |

You will also set `MAIL_FROM` (a normal variable) to the sending address.

> [!NOTE]
> Google changes the names and layout of its console fairly often. If a menu has moved, search the console for the term in **bold**.

## Before you start

- Use a **dedicated Gmail account** for the project (for example `<your-project>.support@gmail.com`), not your personal one.
- Know the limits: a free Gmail account can send roughly 500 messages per day. The worker caps itself at 400 verification emails per day to stay under that.
- This is separate from "Sign in with Google" on the front end. You can reuse the same Google Cloud project, but the OAuth client IDs are different.

## 1. Create a Google Cloud project

1. Sign in to the [Google Cloud Console](https://console.cloud.google.com/) **with the dedicated Gmail account**.
2. Open the project selector and choose **New project**.
3. Name it (for example `skylab-mail`) and create it.

## 2. Enable the Gmail API

1. Go to **APIs & Services → Library**.
2. Search for **Gmail API** and click **Enable**.

## 3. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen** (in newer consoles this is under **Google Auth Platform**).
2. Choose user type **External** and fill in the app name, support email and developer contact email.
3. When asked for scopes, add only:
   `https://www.googleapis.com/auth/gmail.send`
4. Save.

### Publish the app (important)

While the app is in **Testing** status, Google expires refresh tokens after **7 days**, and verification emails will silently start failing a week after setup.

To avoid this, set the publishing status to **In production**. Because you are the only user and you are using your own account, you do not need to complete Google's verification process. You will simply see an "unverified app" warning once, during step 5.

## 4. Create the OAuth client

1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Under **Authorized redirect URIs**, add exactly:
   `https://developers.google.com/oauthplayground`
4. Create it, then copy the **Client ID** and **Client secret**.

## 5. Obtain the refresh token

This uses Google's OAuth Playground, so you do not need to write any code.

1. Open <https://developers.google.com/oauthplayground/>.
2. Click the **gear icon** (top right), tick **Use your own OAuth credentials**, and paste your Client ID and Client secret.
3. In the left panel, find **Gmail API v1** and select `https://www.googleapis.com/auth/gmail.send`. (You can also type it in the "Input your own scopes" box.)
4. Click **Authorize APIs**, sign in with the dedicated Gmail account and accept. If you see an "unverified app" warning, choose **Advanced → Go to <app name>**.
5. Back in the playground, click **Exchange authorization code for tokens**.
6. Copy the **Refresh token** value.

Treat the refresh token like a password. Anyone who has it can send email as that account.

## 6. Store the values in the worker

```bash
wrangler secret put GMAIL_CLIENT_ID
wrangler secret put GMAIL_CLIENT_SECRET
wrangler secret put GMAIL_REFRESH_TOKEN
```

Then set the sender in `wrangler.toml`:

```toml
[vars]
MAIL_FROM = "<your-project>.support@gmail.com"
```

`MAIL_FROM` must be the same account that granted the token. Redeploy:

```bash
wrangler deploy
```

## 7. Test it

1. Open the site and start a sign-up with an email address you can read.
2. A message titled "Skylab · O teu código é 123456" (or the English version) should arrive within a few seconds. Check the spam folder the first time.
3. Enter the code to finish creating the account.

To watch for errors while you test:

```bash
wrangler tail
```

A failure is logged as `[mail] gmail send <status> ...` or `gmail token <status>`.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Sign-up shows "Não foi possível enviar o email de verificação" | Check `wrangler tail` for the exact error; the entries below cover the usual ones |
| `gmail token 400` / `invalid_grant` | The refresh token is expired or revoked. If the app was still in Testing, publish it and repeat step 5. Also check that the client ID and secret match the ones used in the Playground. |
| `gmail token 401` / `invalid_client` | Client ID or secret is wrong, or has stray spaces from copying. Re-run `wrangler secret put`. |
| `gmail send 403` | The Gmail API is not enabled, or the token was issued without the `gmail.send` scope. Redo steps 2 and 5. |
| `gmail send 400` | Invalid recipient or malformed message. Check that `MAIL_FROM` is a valid address. |
| `email não configurado (GMAIL_*)` in the logs | One of the three secrets is missing. List them with `wrangler secret list`. |
| Emails arrive in spam | Normal for a new sender. Mark one as "Not spam"; reputation improves with use. |
| Users see "Demasiados pedidos" | A rate limit was hit: 5 codes per email per hour, one per 45 seconds, 400 per day overall. |

## Rotating the token

If you suspect the refresh token leaked, go to your Google Account → **Security → Third-party access**, remove the app, then repeat steps 5 and 6 to generate a new token.
