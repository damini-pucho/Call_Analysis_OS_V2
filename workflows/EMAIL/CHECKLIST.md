# EMAIL — import checklist

The V1 "user create and send email" flow (Gmail), unchanged except a Return step at the end.
1. Import `EMAIL.json`; the Gmail step keeps V1's connection id — re-attach the Gmail connection if Studio asks.
2. Publish; set `WEBHOOK_EMAIL` in the V2 server env.
3. V2 sends the V1 payload shape (`recipient.email`, `subject`, `email_content.body_text`, …) for: new-user credentials,
   password resets, and manager / agent notifications (red coaching, ZTP, high compliance risk, training assigned / completed).
4. Test: create a user under Team & roles — the toast says "Sign-in details were emailed" instead of showing the password.
