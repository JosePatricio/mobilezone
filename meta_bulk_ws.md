
To message people who aren't on the allowed list, you have to switch from Meta's free test number to your own business phone number. Here are the steps in order.

Step 1: Get a phone number for it

- The number must not be on WhatsApp (regular or Business app) right now. If it is, delete that WhatsApp account first: in the app, Settings → Account → Delete account.
- It has to be able to receive an SMS or a voice call for the verification code.
- Once connected, the number only works through the API. You can't use it in the WhatsApp app on a phone anymore.
- 👉 The easiest option is a new SIM card just for this.
0991072443
+593991072443

Step 2: Add the number in Meta

1. Go to developers.facebook.com → My Apps → your app → WhatsApp → API Setup.
2. Click "Add phone number".
3. Fill in:
   - Display name: your business name, e.g. MobileZone or Pixcell. It must match your business. Meta reviews it, which usually takes 1–2 days.
   - Category, plus a short description.
   - Number: pick Ecuador (+593) and enter it.
4. Enter the code Meta sends to that phone by SMS or call.

Step 3: Add a payment method (required)

1. Go to business.facebook.com → WhatsApp Manager → Overview (or Billing & payments).
2. Add payment method → credit or debit card.
3. ⚠️ Choose the currency (USD) carefully. You can't change it later.

Without this, real sends fail with a payment error.

Step 4: Give your permanent token access to the new account

The new number may belong to a different WhatsApp Business Account than the test number.
1. Go to business.facebook.com/settings → System users → mobilezone-api → Assign assets.
2. WhatsApp accounts → tick the account with your new number → Full control.

You don't need a new token. The one you have now covers the newly assigned account.

Step 5: Copy the new IDs

In API Setup, choose your new number in the "From" dropdown and copy:
- Phone number ID
- WhatsApp Business Account ID

Step 6: Update the server

cd /opt/mobilezone
nano .env
#   WHATSAPP_PHONE_NUMBER_ID=<new id>
#   WHATSAPP_BUSINESS_ACCOUNT_ID=<new id>
docker compose up -d backend

Step 7: Create your own template

hello_world is only a demo, so make a real one:
1. WhatsApp Manager → Message templates → Create template.
2. Category: Marketing for promotions or Utility for order and repair updates. Language: Spanish.
3. Example body: Hola {{1}}, tenemos una promo para tu {{2}} 📱. Responde BAJA si no deseas recibir más mensajes.
4. Submit it. Approval takes from a few minutes up to 24 hours. Once it's approved, it shows up in your app's Plantilla list.

Step 8: Test it

1. Propaganda → CRM → WhatsApp. Leave every client unchecked.
2. In Números de prueba, add 1–2 numbers of friends or family who agreed to it.
3. Pick your template and send.
4. Check Campañas to see whether each message shows as Enviado or Fallido.

⚠️ Before sending to real clients

- Consent: WhatsApp's rules say recipients must have agreed to receive messages from you. If people report you as spam, Meta lowers your quality rating and can block the number.
- Daily limit: new accounts can message about 250 different people per 24 hours. Verifying your business (Business settings → Security Center → Start verification) raises that limit.
- Display name: until it's approved, messages may show only your phone number.

If sends fail with "Account not registered" (error 133010), tell me and I'll give you the one command that fixes it.

Want to do the webhook next? It's what turns "Enviado" into Entregado / Leído and handles BAJA replies automatically. It needs https://pixcell.net to work over HTTPS.





*********** IGNORE THIS SECTION ******************

WHATSAPP_ACCESS_TOKEN=EAAOEdFzCpiMBSrjveiZCW8iYiRtzF51UvtRRZBmwBqz4fvXK1ypPtNRKmza1kiNLOmhpprpetT5PIWHzad78cZB5BbPDjD4UkzcZA0zOHRPqn4S9TJOC8A8t4bhYjbCy7R18pjcnIgZBNBjpE7JjgLJpwTqK16f8ZAgK5q8Nx13v3yHCSYX0KnO1ePgl4yrMJ7ZA7gyOn9L4cDEdnUdAafcggx0Pif316okRZAewp4Xzx7rvNHi6PKxaJtGkGHVjhDQmBhtSojUctQxxrz9FcKilXwZDZD
WHATSAPP_APP_SECRET=10d796105cc31849bd6b691168bda044
WHATSAPP_PHONE_NUMBER_ID=1308055515733425
WHATSAPP_BUSINESS_ACCOUNT_ID=1660539825689218
WHATSAPP_VERIFY_TOKEN=mobilezone_webhook_2026_secure

EAAOEdFzCpiMBSu3ycr0AJPHoPzOc62ShtxjYNJG4SqZArr66gKNym1ZB46MZBfFjAsQkL0pLTJzZA9CaaR6odZBxhe98ri82j3lpdFdKwiTMA4V6VUMpvnGlYaa5ZBeVQCJYhzZCAZCWhdjqg95r3GBvzGauGJ2V4tchqxzvmLtTD4qSGalHSpi7diAkd0RVUwZDZD

*********** IGNORE THIS SECTION ******************