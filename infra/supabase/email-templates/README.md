# WhyMatch authentication email templates

These source-controlled templates mirror the hosted Supabase Auth configuration
for the development platform. They deliberately contain English and German in
one concise message because Supabase selects one template per email action and
WhyMatch does not send a trusted locale value to Auth.

Configured actions:

- `confirmation.html` — account email confirmation
- `recovery.html` — forgotten-password recovery

The only link is Supabase's single-use `{{ .ConfirmationURL }}` value. The
templates contain no tracking pixel, remote image, analytics identifier, or
marketing content. Subjects live beside the HTML so changes can be reviewed in
Git before the hosted configuration is updated.
