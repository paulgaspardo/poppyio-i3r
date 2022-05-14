# Poppy.io i3r

This is a Poppy I/O Service for anonymously uploading images
to Imgur. To run it, you'll have to supply an Imgur Client ID
in the `IMGUR_CLIENT_ID` environment variable.

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

Although the Imgur API would work entirely client side, this
proxies the upload requests through a server to avoid hitting
Imgur API rate limits.

## Getting an Imgur Client ID

Refer to the [Imgur API documentation](https://apidocs.imgur.com),
specfically the **REGISTRATION QUICKSTART** section.

## Deploying to Heroku

You'll be prompted for your Imgur API key when setting it up.
For domain-based service discovery use the `.herokuapp.com` domain
for the app name you pick:

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https%3A%2F%2Fgithub.com%2Fpaulgaspardo%2Fpoppyio-i3r)

## Running it locally

Optionally, create a `.env.local` file at the root of the project (next to this README) and add you Imgur Client ID
to it (or you can just set the environment variable through
the shell):

```
IMGUR_CLIENT_ID=1234567890abcdef
```

To run the development server:

```bash
npm run dev
# or
yarn dev
```

The service page URL will be http://localhost:3000/upload-dialog

### Using with ngrok

To allow domain-based service discovery to work, the service
must be running on an HTTPS URL. The easiest way to do that is
to use something like [ngrok](https://ngrok.com) (free
with registration) to expose it to the internet.

Run ngrok with:

```bash
ngrok http 3000
```

Use the `.ngrok.io` domain in the forwarding URL (for example `9dc1-5-135-235-227.eu.ngrok.io` here):

```
Forwarding     https://9dc1-5-135-235-227.eu.ngrok.io -> http://localhost:3000                                                    
```
